import IORedis from 'ioredis';

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function createRedis(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}
