import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import { NOTIFICATIONS_QUEUE } from './outbox-relay';

export interface OutboxJob {
  outboxId: string;
  eventType: string;
  payload: unknown;
}

/**
 * Notification fan-out (ADR-0010). Channel senders (FCM / MSG91 / WhatsApp /
 * SES, multilingual versioned templates) land with the integrations
 * workstream — until then delivery is a structured log so the pipeline is
 * exercisable end to end. Handlers must stay idempotent: at-least-once means
 * the same outboxId can arrive twice.
 */
export function startNotificationsWorker(connection: IORedis): Worker<OutboxJob> {
  return new Worker<OutboxJob>(
    NOTIFICATIONS_QUEUE,
    (job: Job<OutboxJob>) => {
      // eslint-disable-next-line no-console
      console.log(
        `[notifications] delivered event=${job.data.eventType} outboxId=${job.data.outboxId}`,
      );
      return Promise.resolve();
    },
    { connection, concurrency: 10 },
  );
}
