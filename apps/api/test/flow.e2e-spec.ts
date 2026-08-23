import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp, db, login, seedIds, RUN, teardown } from './helpers';

/**
 * The golden path as one regression test: intake → review (auto-score) →
 * suggest → accept → pipeline → immutable verification → idempotent billing.
 * Every hop asserts the money-and-training invariants the ADRs promise.
 */
describe('golden path (e2e)', () => {
  let app: INestApplication<App>;
  let http: App;
  let esm: string;
  let reviewer: string;
  let ops: string;
  let finance: string;
  let territoryId: string;
  let candidateId: string;
  let requirementId: string;
  let placementId: string;
  const PERIOD = '2099-01'; // far-future period keeps reruns disjoint from ops data

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    [esm, reviewer, ops, finance] = await Promise.all([
      login(app, 'esm@dev.local'),
      login(app, 'reviewer@dev.local'),
      login(app, 'ops@dev.local'),
      login(app, 'finance@dev.local'),
    ]);
    ({ territoryId } = await seedIds());
  });
  afterAll(async () => {
    await teardown(app);
  });

  it('walk-in lands in the review queue', async () => {
    const res = await request(http)
      .post('/candidates')
      .set('authorization', `Bearer ${esm}`)
      .send({
        phone: `+9196${RUN}21`,
        name: 'Golden E2E',
        territoryId,
        languages: ['kn', 'hi'],
        qualification: 'Ex-serviceman guard',
        totalExpMonths: 60,
        relevantExpMonths: 36,
        locationFlexible: true,
      })
      .expect(201);
    candidateId = res.body.id;
    expect(res.body.status).toBe('PENDING_REVIEW');
  });

  it('reviewer approval auto-scores and captures the training decision', async () => {
    const res = await request(http)
      .post(`/review/${candidateId}/approve`)
      .set('authorization', `Bearer ${reviewer}`)
      .send({ corrections: { educationLevel: '12th' }, rationale: 'e2e' })
      .expect(201);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.score).toBeGreaterThan(0);
    // Double-decide is blocked.
    await request(http)
      .post(`/review/${candidateId}/approve`)
      .set('authorization', `Bearer ${reviewer}`)
      .send({})
      .expect(400);
    const decision = await db().decisionEvent.findFirst({
      where: { decisionType: 'REVIEWER_CORRECTION', label: 'approved' },
      orderBy: { at: 'desc' },
    });
    expect(decision).toBeTruthy();
    expect(JSON.stringify(decision!.output)).toContain('12th');
    expect(JSON.stringify(decision!.input)).not.toContain('Golden E2E'); // PII stays out
  });

  it('ops suggests, esm accepts into a placement, pipeline is forward-only', async () => {
    const reqRes = await request(http)
      .post('/requirements')
      .set(
        'authorization',
        `Bearer ${await login(app, 'contractor@dev.local')}`,
      )
      .send({ roleTitle: `Golden Req ${RUN}`, headcount: 1, territoryId })
      .expect(201);
    requirementId = reqRes.body.id;

    const sug = await request(http)
      .post('/matching/suggestions')
      .set('authorization', `Bearer ${ops}`)
      .send({ requirementId, candidateId })
      .expect(201);
    await request(http)
      .post(`/matching/suggestions/${sug.body.id}/accept`)
      .set('authorization', `Bearer ${esm}`)
      .expect(201);

    const placements = await request(http)
      .get(`/placements?requirementId=${requirementId}`)
      .set('authorization', `Bearer ${esm}`)
      .expect(200);
    placementId = placements.body.items[0].id;

    await request(http)
      .patch(`/placements/${placementId}/stage`)
      .set('authorization', `Bearer ${esm}`)
      .send({ stage: 'JOINED' })
      .expect(200);
    await request(http)
      .patch(`/placements/${placementId}/stage`)
      .set('authorization', `Bearer ${esm}`)
      .send({ stage: 'MET' })
      .expect(400); // forward-only
  });

  it('verification facts are immutable (duplicate period → 409)', async () => {
    await request(http)
      .post('/verifications')
      .set('authorization', `Bearer ${esm}`)
      .send({ placementId, period: PERIOD, outcome: 'ACTIVE' })
      .expect(201);
    await request(http)
      .post('/verifications')
      .set('authorization', `Bearer ${esm}`)
      .send({ placementId, period: PERIOD, outcome: 'LEFT' })
      .expect(409);
  });

  it('billing runs are idempotent and projections sum from the ledger', async () => {
    const key = `e2e-${RUN}`;
    const first = await request(http)
      .post('/billing/runs')
      .set('authorization', `Bearer ${finance}`)
      .send({ period: PERIOD, idempotencyKey: key })
      .expect(201);
    expect(first.body.linesWritten).toBeGreaterThanOrEqual(1);

    const rerun = await request(http)
      .post('/billing/runs')
      .set('authorization', `Bearer ${finance}`)
      .send({ period: PERIOD, idempotencyKey: key })
      .expect(201);
    expect(rerun.body.linesWritten).toBe(0); // ADR-0005: rerun writes nothing

    const invoices = await request(http)
      .get(`/billing/invoices?period=${PERIOD}`)
      .set('authorization', `Bearer ${finance}`)
      .expect(200);
    expect(BigInt(invoices.body[0].totalPaise)).toBeGreaterThan(0n);
  });

  it('the audit chain stays intact through the whole flow', async () => {
    const [row] = await db().$queryRaw<
      { broken: bigint | null }[]
    >`SELECT audit_chain_verify() AS broken`;
    expect(row.broken).toBeNull();
  });
});
