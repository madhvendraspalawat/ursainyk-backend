// @ursainyk/db — PrismaClient factory (Prisma 7 + @prisma/adapter-pg) and generated types.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export * from './generated/prisma/enums';

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;

/**
 * Territory scoping (ADR-0007): run `fn` in a transaction with
 * `app.territory_ids` set, so RLS policies keyed on app_territory_ids()
 * see the caller's territories. Empty list ⇒ setting stays '' ⇒ RLS fails closed.
 */
export async function withTerritoryScope<T>(
  db: PrismaClient,
  territoryIds: string[],
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.territory_ids = '${territoryIds.map(sanitizeUuid).join(',')}'`,
    );
    return fn(tx);
  });
}

function sanitizeUuid(id: string): string {
  if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) throw new Error(`invalid territory id: ${id}`);
  return id;
}

/**
 * Unrestricted scope ('*') for self-service and admin paths that filter by
 * ownership instead of territory. RLS still fails closed for any query that
 * sets neither scope (ADR-0007).
 */
export async function withGlobalScope<T>(
  db: PrismaClient,
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.territory_ids = '*'`);
    return fn(tx);
  });
}
