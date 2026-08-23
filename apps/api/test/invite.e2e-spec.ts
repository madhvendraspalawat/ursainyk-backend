import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp, db, login, RUN, teardown } from './helpers';

/** Production credential posture: invite links, never passwords in responses. */
describe('invite links (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
  });
  afterAll(async () => {
    await teardown(app);
  });

  it('creates a user with no credential in the response; link is single-use', async () => {
    const root = await login(app, 'root@dev.local');
    const email = `invitee-${RUN}@dev.local`;
    const created = await request(http)
      .post('/identity/users')
      .set('authorization', `Bearer ${root}`)
      .send({ email, name: 'Invitee E2E', roles: ['OPS'] })
      .expect(201);
    expect(created.body.invited).toBe(true);
    expect(created.body.tempPassword).toBeUndefined();

    // The raw token travels only in the outbox payload → email. Pull it there.
    const outbox = await db().outbox.findFirst({
      where: { eventType: 'user.invited' },
      orderBy: { at: 'desc' },
    });
    const link = (outbox!.payload as { link: string }).link;
    expect(link).toContain('http://portal.e2e.local/set-password?token=');
    const token = link.split('token=')[1];

    await request(http)
      .post('/auth/password/set')
      .send({ token, newPassword: `first-pass-${RUN}` })
      .expect(204);
    await request(http)
      .post('/auth/password/set')
      .send({ token, newPassword: 'second-try-pw' })
      .expect(401); // single use

    await request(http)
      .post('/auth/login')
      .send({ email, password: `first-pass-${RUN}` })
      .expect(200);
  });

  it('rejects expired tokens', async () => {
    const root = await login(app, 'root@dev.local');
    await request(http)
      .post('/identity/users')
      .set('authorization', `Bearer ${root}`)
      .send({
        email: `expired-${RUN}@dev.local`,
        name: 'Expired E2E',
        roles: ['OPS'],
      })
      .expect(201);
    const outbox = await db().outbox.findFirst({
      where: { eventType: 'user.invited' },
      orderBy: { at: 'desc' },
    });
    const token = (outbox!.payload as { link: string }).link.split('token=')[1];
    await db().passwordSetToken.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(http)
      .post('/auth/password/set')
      .send({ token, newPassword: 'whatever-pass-1' })
      .expect(401);
  });
});
