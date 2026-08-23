import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { authenticator } from 'otplib';
import {
  createApp,
  db,
  login,
  otpLogin,
  otpLoginPair,
  RUN,
  teardown,
} from './helpers';

describe('auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await teardown(app);
  });

  it('self-registers an unknown phone via OTP and issues tokens', async () => {
    const phone = `+9198${RUN}01`;
    const token = await otpLogin(app, phone);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.kind).toBe('CANDIDATE');
    expect(me.body.roles).toEqual(['CANDIDATE']);
    const user = await db().user.findUnique({ where: { phone } });
    expect(user?.kind).toBe('CANDIDATE');
  });

  it('rejects a wrong OTP without leaking account existence', async () => {
    const phone = `+9198${RUN}02`;
    await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone })
      .expect(202);
    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone, code: '000000' })
      .expect(401);
    // Unknown phone gets the same 202 as a known one.
    await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone: '+919999999999' })
      .expect(202);
  });

  it('rotates refresh tokens and revokes the whole family on reuse', async () => {
    const http = app.getHttpServer();
    const pair = await otpLoginPair(app, `+9198${RUN}03`);
    const rt1 = pair.refreshToken;

    const rotated = await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: rt1 })
      .expect(200);
    const rt2 = rotated.body.refreshToken as string;
    expect(rt2).not.toBe(rt1);

    // Reuse of the rotated-out token: theft signal → whole family dies.
    await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: rt1 })
      .expect(401);
    await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: rt2 })
      .expect(401);
  });

  it('enforces TOTP for an admin only after enrollment is activated', async () => {
    const token = await login(app, 'esm-manager@dev.local'); // not enrolled → flag path, login works
    const enroll = await request(app.getHttpServer())
      .post('/auth/totp/enroll')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    const secret = enroll.body.secret as string;

    await request(app.getHttpServer())
      .post('/auth/totp/activate')
      .set('authorization', `Bearer ${token}`)
      .send({ code: authenticator.generate(secret) })
      .expect(204);

    // Now TOTP is mandatory:
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'esm-manager@dev.local', password: 'dev-password-1' })
      .expect(401);
    await login(app, 'esm-manager@dev.local', authenticator.generate(secret));
  });

  it('password change revokes existing sessions', async () => {
    const http = app.getHttpServer();
    const pairRes = await request(http)
      .post('/auth/login')
      .send({ email: 'sales@dev.local', password: 'dev-password-1' })
      .expect(200);
    await request(http)
      .post('/auth/password/change')
      .set('authorization', `Bearer ${pairRes.body.accessToken}`)
      .send({
        currentPassword: 'dev-password-1',
        newPassword: `changed-${RUN}-pw`,
      })
      .expect(204);
    await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: pairRes.body.refreshToken })
      .expect(401);
    await request(http)
      .post('/auth/login')
      .send({ email: 'sales@dev.local', password: `changed-${RUN}-pw` })
      .expect(200);
  });

  it('returns 400 with zod issues for malformed bodies', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(res.body.issues?.length).toBeGreaterThan(0);
  });
});
