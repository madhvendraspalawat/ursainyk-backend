/**
 * Jest globalSetup: fresh, isolated test database per run.
 * Creates ursainyk_e2e (dropping any previous), applies all migrations
 * (including hand-written triggers/RLS), runs the synthetic seed.
 * Requires a reachable Postgres — docker compose locally, the service
 * container in CI. Never touches the dev database.
 */
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const ADMIN_URL =
  process.env.E2E_ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://nabhahita:nabhahita@localhost:5432/nabhahita';
const TEST_DB = 'ursainyk_e2e';

export default async function globalSetup(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const testUrl = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
  process.env.E2E_DATABASE_URL = testUrl;

  const dbPkg = `${__dirname}/../../../packages/db`;
  const env = { ...process.env, DATABASE_URL: testUrl };
  execSync('npx prisma migrate deploy', { cwd: dbPkg, env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed.ts', { cwd: dbPkg, env, stdio: 'inherit' });
}
