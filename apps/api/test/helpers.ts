import { createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createPrismaClient, type Db } from '@ursainyk/db';
import { AppModule } from '../src/app.module';
import { ZodExceptionFilter } from '../src/zod-exception.filter';

/**
 * Boots the real AppModule against the isolated e2e database (globalSetup).
 * The throttler is bypassed — e2e suites hammer auth endpoints far past the
 * production 5/min limit by design.
 */
export async function createApp(): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
  process.env.PORTAL_BASE_URL = 'http://portal.e2e.local';
  process.env.THROTTLE_DISABLED = '1';
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.useGlobalFilters(new ZodExceptionFilter());
  await app.init();
  return app;
}

/** Close the app and the suite's Prisma handle so jest can exit cleanly. */
export async function teardown(app: INestApplication<App>): Promise<void> {
  await app.close();
  if (dbSingleton) {
    await dbSingleton.$disconnect();
    dbSingleton = undefined;
  }
}

export const DEV_PASSWORD = 'dev-password-1';

/** Unique per-run suffix so suites never collide on unique columns. */
export const RUN = Date.now().toString().slice(-7);

let dbSingleton: Db | undefined;
export function db(): Db {
  dbSingleton ??= createPrismaClient(process.env.E2E_DATABASE_URL);
  return dbSingleton;
}

export async function login(
  app: INestApplication<App>,
  email: string,
  totp?: string,
) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: DEV_PASSWORD, ...(totp && { totp }) })
    .expect(200);
  return res.body.accessToken as string;
}

const KNOWN_OTP = '424242';

/**
 * OTP login for a (possibly auto-registered) candidate phone. Codes are only
 * ever stored hashed, so the test plants a known code on the credential row —
 * the verify path itself (hashing, expiry, attempts) still runs for real.
 */
export async function otpLogin(
  app: INestApplication<App>,
  phone: string,
): Promise<string> {
  await request(app.getHttpServer())
    .post('/auth/otp/request')
    .send({ phone })
    .expect(202);
  const user = await db().user.findUniqueOrThrow({ where: { phone } });
  await db().credential.update({
    where: { userId: user.id },
    data: {
      otpHash: createHash('sha256').update(KNOWN_OTP).digest('hex'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      otpAttempts: 0,
      otpLockedTil: null,
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: KNOWN_OTP })
    .expect(200);
  return res.body.accessToken as string;
}

/** Same as otpLogin but returns the full token pair. */
export async function otpLoginPair(
  app: INestApplication<App>,
  phone: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  await request(app.getHttpServer())
    .post('/auth/otp/request')
    .send({ phone })
    .expect(202);
  const user = await db().user.findUniqueOrThrow({ where: { phone } });
  await db().credential.update({
    where: { userId: user.id },
    data: {
      otpHash: createHash('sha256').update(KNOWN_OTP).digest('hex'),
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      otpAttempts: 0,
      otpLockedTil: null,
    },
  });
  const res = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: KNOWN_OTP })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}

export async function seedIds() {
  const territory = await db().territory.findUniqueOrThrow({
    where: { code: 'BLR-01' },
  });
  const centre = await db().esmCentre.findUniqueOrThrow({
    where: { code: 'CENTRE-01' },
  });
  const org = await db().contractorOrg.findFirstOrThrow();
  return { territoryId: territory.id, centreId: centre.id, orgId: org.id };
}
