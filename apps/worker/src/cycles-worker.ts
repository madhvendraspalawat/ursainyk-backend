import nodemailer from 'nodemailer';
import { Queue, Worker } from 'bullmq';
import type IORedis from 'ioredis';
import type { Db } from '@ursainyk/db';

export const CYCLES_QUEUE = 'cycles';

/** 'YYYY-MM' in IST — the business operates on Indian months. */
export function currentPeriod(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Daily operational cycle (PLAN wk 9–11), one repeatable job:
 *  1. per-centre verification reminders — JOINED placements missing this
 *     period's fact → outbox `verification.reminder`
 *  2. retention/win-back — prior period's LEFT heads → outbox `retention.winback`
 *  3. audit chain verification — emits `audit.chain_checked`; a broken chain
 *     additionally alerts SECURITY_ALERT_EMAIL by direct SMTP (deliberately
 *     independent of DB-stored templates: a tamperer must not be able to
 *     silence the alarm by editing a template row).
 */
export async function scheduleCycles(connection: IORedis): Promise<Queue> {
  const queue = new Queue(CYCLES_QUEUE, { connection });
  await queue.upsertJobScheduler(
    'cycles-daily',
    { pattern: '0 6 * * *', tz: 'Asia/Kolkata' },
    { name: 'daily', opts: { removeOnComplete: 30 } },
  );
  return queue;
}

export function startCyclesWorker(connection: IORedis, db: Db): Worker {
  return new Worker(
    CYCLES_QUEUE,
    async () => {
      const period = currentPeriod();
      await verificationReminders(db, period);
      await winbackDigest(db, previousPeriod(period));
      await chainCheck(db);
    },
    { connection, concurrency: 1 },
  );
}

async function verificationReminders(db: Db, period: string): Promise<void> {
  const due = await db.placement.groupBy({
    by: ['centreId'],
    where: { stage: 'JOINED', centreId: { not: null }, verifications: { none: { period } } },
    _count: true,
  });
  for (const row of due) {
    if (!row.centreId) continue;
    await db.outbox.create({
      data: {
        eventType: 'verification.reminder',
        payload: { centreId: row.centreId, period, dueCount: row._count },
      },
    });
  }
}

async function winbackDigest(db: Db, period: string): Promise<void> {
  const left = await db.verification.findMany({
    where: { period, outcome: 'LEFT' },
    include: { placement: { select: { centreId: true } } },
  });
  const byCentre = new Map<string, number>();
  for (const v of left) {
    if (!v.placement.centreId) continue;
    byCentre.set(v.placement.centreId, (byCentre.get(v.placement.centreId) ?? 0) + 1);
  }
  for (const [centreId, count] of byCentre) {
    await db.outbox.create({
      data: { eventType: 'retention.winback', payload: { centreId, period, count } },
    });
  }
}

async function chainCheck(db: Db): Promise<void> {
  const [row] = await db.$queryRaw<{ broken: bigint | null }[]>`SELECT audit_chain_verify() AS broken`;
  const intact = row.broken === null;
  await db.outbox.create({
    data: {
      eventType: 'audit.chain_checked',
      payload: { intact, firstBrokenId: row.broken?.toString() ?? null },
    },
  });
  if (!intact && process.env.SECURITY_ALERT_EMAIL) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@ursainyk.local',
      to: process.env.SECURITY_ALERT_EMAIL,
      subject: '[SECURITY] audit chain verification FAILED',
      text: `audit_chain_verify() reports the chain broken at row id ${row.broken}. Investigate immediately — history may have been tampered with.`,
    });
  }
}
