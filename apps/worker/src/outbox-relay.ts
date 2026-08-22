import { Queue } from 'bullmq';
import type { Db } from '@ursainyk/db';

export const NOTIFICATIONS_QUEUE = 'notifications';
export const PARSER_QUEUE = 'parser';

/** Event-type routing: parser work is heavy and rate-limited — own queue. */
export function queueFor(eventType: string): 'parser' | 'notifications' {
  return eventType.startsWith('document.') ? PARSER_QUEUE : NOTIFICATIONS_QUEUE;
}

const BATCH = 50;
const POLL_MS = 2000;

/**
 * Outbox relay (ADR-0010): claims unrelayed rows with FOR UPDATE SKIP LOCKED
 * (safe with multiple worker replicas), enqueues each to BullMQ with
 * jobId = outbox row id — BullMQ deduplicates on jobId, so a crash between
 * enqueue and markRelayed re-enqueues harmlessly. At-least-once end to end;
 * consumers stay idempotent.
 */
export class OutboxRelay {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly queues: Record<'parser' | 'notifications', Queue>,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((r) => setTimeout(r, 50));
  }

  async tick(): Promise<number> {
    if (this.running) return 0; // previous tick still in flight
    this.running = true;
    try {
      return await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; eventType: string; payload: unknown }[]>`
          SELECT id, "eventType", payload FROM "Outbox"
          WHERE "relayedAt" IS NULL
          ORDER BY at
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        for (const row of rows) {
          try {
            await this.queues[queueFor(row.eventType)].add(
              row.eventType,
              { outboxId: row.id, eventType: row.eventType, payload: row.payload },
              {
                jobId: row.id,
                removeOnComplete: 1000,
                removeOnFail: false,
                attempts: 5,
                backoff: { type: 'exponential', delay: 5000 },
              },
            );
            await tx.outbox.update({ where: { id: row.id }, data: { relayedAt: new Date() } });
          } catch (e) {
            await tx.outbox.update({
              where: { id: row.id },
              data: { attempts: { increment: 1 }, lastError: String(e).slice(0, 500) },
            });
          }
        }
        return rows.length;
      });
    } finally {
      this.running = false;
    }
  }
}
