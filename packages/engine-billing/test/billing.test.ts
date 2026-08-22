// Pinned tests (ADR-0005): every published figure has a pin. A failing test
// here means the money math changed — deliberate decision territory.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { computeBillingRun, splitLargestRemainder, type BillingRates } from '../src';

const RATES: BillingRates = { pricePerActiveHeadPaise: 200000n, esmShareBp: 3000n };

test('largest remainder: 100 over 3 equal parts = [34,33,33] by id order (Quiz-01 canon)', () => {
  const r = splitLargestRemainder(100n, [
    { id: 'a', weight: 1n },
    { id: 'b', weight: 1n },
    { id: 'c', weight: 1n },
  ]);
  assert.deepEqual(r, [
    { id: 'a', amountPaise: 34n },
    { id: 'b', amountPaise: 33n },
    { id: 'c', amountPaise: 33n },
  ]);
});

test('largest remainder: parts always sum exactly, many shapes', () => {
  for (const [total, weights] of [
    [1n, [1n, 1n, 1n]],
    [999n, [3n, 3n, 1n]],
    [123456789n, [7n, 11n, 13n, 17n]],
  ] as const) {
    const parts = weights.map((w, i) => ({ id: String(i), weight: w }));
    const split = splitLargestRemainder(total, parts);
    assert.equal(split.reduce((a, p) => a + p.amountPaise, 0n), total, String(total));
  }
});

test('largest remainder: input order does not change the result (determinism)', () => {
  const parts = [
    { id: 'x', weight: 1n },
    { id: 'y', weight: 1n },
    { id: 'z', weight: 1n },
  ];
  const a = splitLargestRemainder(100n, parts);
  const b = splitLargestRemainder(100n, [...parts].reverse());
  assert.deepEqual(
    new Map(a.map((p) => [p.id, p.amountPaise])),
    new Map(b.map((p) => [p.id, p.amountPaise])),
  );
});

test('billing run: ACTIVE and WON_BACK billed, LEFT not', () => {
  const r = computeBillingRun(
    [
      { placementId: 'p1', orgId: 'o1', centreId: 'c1', outcome: 'ACTIVE' },
      { placementId: 'p2', orgId: 'o1', centreId: 'c1', outcome: 'LEFT' },
      { placementId: 'p3', orgId: 'o2', centreId: null, outcome: 'WON_BACK' },
    ],
    RATES,
  );
  assert.equal(r.invoiceLines.length, 2);
  assert.equal(r.payoutLines.length, 1); // p3 has no centre
  assert.equal(r.totals.invoicedPaise, 400000n);
  assert.equal(r.totals.payoutPaise, 60000n); // 30% of one head
});

test('billing run: pinned per-line figures at dev rates', () => {
  const r = computeBillingRun(
    [{ placementId: 'p1', orgId: 'o1', centreId: 'c1', outcome: 'ACTIVE' }],
    RATES,
  );
  assert.equal(r.invoiceLines[0].amountPaise, 200000n); // ₹2000
  assert.equal(r.payoutLines[0].amountPaise, 60000n); // ₹600
});

test('billing run: recompute is byte-identical (idempotent projections)', () => {
  const facts = [
    { placementId: 'p2', orgId: 'o1', centreId: 'c1', outcome: 'ACTIVE' as const },
    { placementId: 'p1', orgId: 'o1', centreId: 'c1', outcome: 'ACTIVE' as const },
  ];
  const a = computeBillingRun(facts, RATES);
  const b = computeBillingRun([...facts].reverse(), RATES);
  assert.deepEqual(a, b);
});
