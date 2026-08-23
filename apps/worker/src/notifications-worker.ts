import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import type { Db } from '@ursainyk/db';
import { allSenders, type ChannelSender, type Rendered } from './channels';
import { NOTIFICATIONS_QUEUE } from './outbox-relay';

export interface OutboxJob {
  outboxId: string;
  eventType: string;
  payload: unknown;
}

const FALLBACK_LOCALE = 'en';

/**
 * Notification fan-out (ADR-0010): resolve the recipient for the event,
 * render the DB-stored multilingual template (highest active version for the
 * recipient's locale, falling back to English), send on every configured
 * channel. Unconfigured channels log a structured line instead — the pipeline
 * is always exercisable. Handlers stay idempotent under at-least-once.
 */
export function startNotificationsWorker(connection: IORedis, db: Db): Worker<OutboxJob> {
  const senders = allSenders();

  return new Worker<OutboxJob>(
    NOTIFICATIONS_QUEUE,
    async (job: Job<OutboxJob>) => {
      const recipients = await resolveRecipients(db, job.data);
      if (recipients.length === 0) {
        console.log(`[notifications] event=${job.data.eventType} outboxId=${job.data.outboxId} (no end-user recipient)`);
        return;
      }
      for (const recipient of recipients)
        for (const sender of senders) {
        const to = sender.channel === 'EMAIL' ? recipient.email : recipient.phone;
        if (!to) continue;
        const rendered = await renderTemplate(db, job.data.eventType, sender.channel, recipient.locale, recipient.vars);
        if (!rendered) continue; // no template for this key/channel — deliberate silence
        if (!sender.configured()) {
          console.log(`[notifications] ${sender.channel} (unconfigured) to=${mask(to)} event=${job.data.eventType}: ${rendered.body.slice(0, 80)}`);
          continue;
        }
        await sender.send(to, rendered);
        console.log(`[notifications] ${sender.channel} sent to=${mask(to)} event=${job.data.eventType}`);
      }
    },
    { connection, concurrency: 10 },
  );
}

interface Recipient {
  phone: string | null;
  email: string | null;
  locale: string;
  vars: Record<string, string>;
}

/** Event → recipients. Events without any (billing, documents) return []. */
async function resolveRecipients(db: Db, job: OutboxJob): Promise<Recipient[]> {
  // Centre-targeted operational digests → every portal member of the centre.
  if (['verification.reminder', 'retention.winback'].includes(job.eventType)) {
    const p = job.payload as {
      centreId: string;
      period: string;
      dueCount?: number;
      count?: number;
    };
    const members = await db.centreMembership.findMany({
      where: { centreId: p.centreId },
      include: { user: true, centre: true },
    });
    return members
      .filter((m) => m.user.email)
      .map((m) => ({
        phone: m.user.phone,
        email: m.user.email,
        locale: m.user.locale,
        vars: {
          name: m.user.name,
          centre: m.centre.name,
          period: p.period,
          count: String(p.dueCount ?? p.count ?? 0),
        },
      }));
  }
  if (job.eventType === 'user.invited') {
    const p = job.payload as { userId: string; link: string };
    const user = await db.user.findUnique({ where: { id: p.userId } });
    if (!user?.email) return [];
    return [
      {
        phone: null, // credentials links go over email only
        email: user.email,
        locale: user.locale,
        vars: { name: user.name, link: p.link },
      },
    ];
  }
  const single = await resolveCandidateRecipient(db, job);
  return single ? [single] : [];
}

async function resolveCandidateRecipient(
  db: Db,
  job: OutboxJob,
): Promise<Recipient | null> {
  const payload = job.payload as { candidateId?: string; placementId?: string };
  let candidateId = payload.candidateId ?? null;
  if (!candidateId && payload.placementId && job.eventType === 'placement.joined') {
    const placement = await db.placement.findUnique({ where: { id: payload.placementId } });
    candidateId = placement?.candidateId ?? null;
  }
  if (!candidateId) return null;
  if (!['candidate.approved', 'candidate.rejected', 'placement.joined'].includes(job.eventType))
    return null;

  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    include: { user: true },
  });
  if (!candidate) return null;
  return {
    phone: candidate.user?.phone ?? candidate.phone ?? null,
    email: candidate.user?.email ?? null,
    locale: candidate.user?.locale ?? FALLBACK_LOCALE,
    vars: {
      name: candidate.name || 'there',
      score: candidate.score?.toString() ?? '',
    },
  };
}

async function renderTemplate(
  db: Db,
  key: string,
  channel: ChannelSender['channel'],
  locale: string,
  vars: Record<string, string>,
): Promise<Rendered | null> {
  const template =
    (await latestTemplate(db, key, channel, locale)) ??
    (await latestTemplate(db, key, channel, FALLBACK_LOCALE));
  if (!template) return null;
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
  return { subject: template.subject ? fill(template.subject) : undefined, body: fill(template.body) };
}

function latestTemplate(db: Db, key: string, channel: ChannelSender['channel'], locale: string) {
  return db.notificationTemplate.findFirst({
    where: { key, channel, locale, active: true },
    orderBy: { version: 'desc' },
  });
}

/** Never log full contact identifiers. */
function mask(to: string): string {
  return to.length <= 6 ? '***' : `${to.slice(0, 4)}…${to.slice(-2)}`;
}
