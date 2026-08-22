// Pinned tests: published scores must be recomputable — a change here is a
// scoring-model change and needs a deliberate decision (CONTRIBUTING).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { computeScore, type ScoringWeights } from '../src';

const DEFAULT: ScoringWeights = {
  qualification: 25,
  education: 15,
  totalExp: 20,
  relevantExp: 20,
  language: 10,
  locationFlexibility: 10,
};

test('empty profile scores 0', () => {
  const r = computeScore({}, DEFAULT);
  assert.equal(r.score, 0);
});

test('full profile scores 900', () => {
  const r = computeScore(
    {
      qualification: 'ITI Electrician',
      educationLevel: '12th',
      totalExpMonths: 60,
      relevantExpMonths: 36,
      languages: ['kn', 'hi'],
      locationFlexible: true,
    },
    DEFAULT,
  );
  assert.equal(r.score, 900);
});

test('pinned mid profile (recomputability canary)', () => {
  const r = computeScore(
    {
      qualification: 'ITI',
      totalExpMonths: 30, // half of full
      languages: ['kn'], // half of full
      locationFlexible: false,
    },
    DEFAULT,
  );
  // qualification 25%·900=225 + totalExp half of 20%·900=90 + language half of 10%·900=45 → 360
  assert.equal(r.score, 360);
  assert.equal(r.breakdown.qualification.points, 225);
  assert.equal(r.breakdown.totalExp.points, 90);
  assert.equal(r.breakdown.language.points, 45);
});

test('weights renormalize: doubling all weights changes nothing', () => {
  const doubled = Object.fromEntries(
    Object.entries(DEFAULT).map(([k, v]) => [k, v * 2]),
  ) as unknown as ScoringWeights;
  const profile = { qualification: 'x', totalExpMonths: 12 };
  assert.equal(computeScore(profile, DEFAULT).score, computeScore(profile, doubled).score);
});

test('deterministic: same input twice = identical result', () => {
  const p = { qualification: 'q', languages: ['kn'], relevantExpMonths: 18 };
  assert.deepEqual(computeScore(p, DEFAULT), computeScore(p, DEFAULT));
});
