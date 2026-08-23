// Worker entrypoint — separate ECS service from the API (ADR-0002).
// Running now: outbox relay + notifications fan-out (ADR-0010).
// Coming with their workstreams: parser jobs, verification cycles, billing runs.
import { Queue } from 'bullmq';
import { createPrismaClient } from '@ursainyk/db';
import { NOTIFICATIONS_QUEUE, OutboxRelay, PARSER_QUEUE } from './outbox-relay';
import { startParserWorker } from './parser-worker';
import { startNotificationsWorker } from './notifications-worker';
import { createRedis } from './redis';

async function main() {
  const db = createPrismaClient(
    process.env.DATABASE_URL ?? 'postgresql://nabhahita:nabhahita@localhost:5432/nabhahita',
  );
  const queueConnection = createRedis();
  const workerConnection = createRedis();
  const notificationsQueue = new Queue(NOTIFICATIONS_QUEUE, { connection: queueConnection });
  const parserQueue = new Queue(PARSER_QUEUE, { connection: queueConnection });
  const relay = new OutboxRelay(db, { notifications: notificationsQueue, parser: parserQueue });
  const notifications = startNotificationsWorker(workerConnection, db);
  const parserWorker = startParserWorker(createRedis(), db);

  relay.start();
  console.log('ursainyk-worker: outbox relay + notifications + parser workers running');

  const shutdown = async () => {
    await relay.stop();
    await notifications.close();
    await parserWorker.close();
    await notificationsQueue.close();
    await parserQueue.close();
    queueConnection.disconnect();
    workerConnection.disconnect();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
