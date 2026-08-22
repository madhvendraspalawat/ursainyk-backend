// Pinned tests for the stub parser — the fixed point the pipeline tests
// against without an API key. Never real PII (CONTRIBUTING).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ParsedProfileSchema, StubResumeParser } from '../src';

const FIXTURE = Buffer.from(
  [
    'name: Synthetic Applicant',
    'languages: kn, hi',
    'qualification: ITI Electrician',
    'education: 12th',
    'totalExpMonths: 48',
    'relevantExpMonths: 24',
    'city: Bengaluru',
    'pincode: 560001',
  ].join('\n'),
  'utf8',
);

test('stub extracts every fixture field', async () => {
  const parsed = await new StubResumeParser().parse({
    kind: 'RESUME_PDF',
    mime: 'application/pdf',
    bytes: FIXTURE,
  });
  assert.equal(parsed.name, 'Synthetic Applicant');
  assert.deepEqual(parsed.languages, ['kn', 'hi']);
  assert.equal(parsed.qualification, 'ITI Electrician');
  assert.equal(parsed.educationLevel, '12th');
  assert.equal(parsed.totalExpMonths, 48);
  assert.equal(parsed.relevantExpMonths, 24);
  assert.equal(parsed.city, 'Bengaluru');
  assert.equal(parsed.pincode, '560001');
  assert.ok(parsed.confidence > 0.9);
});

test('stub omits unreadable fields instead of guessing', async () => {
  const parsed = await new StubResumeParser().parse({
    kind: 'RESUME_PHOTO',
    mime: 'image/jpeg',
    bytes: Buffer.from('name: OnlyName Person\n', 'utf8'),
  });
  assert.equal(parsed.name, 'OnlyName Person');
  assert.equal(parsed.qualification, undefined);
  assert.equal(parsed.pincode, undefined);
});

test('schema rejects an invalid pincode (boundary holds against any impl)', () => {
  assert.throws(() => ParsedProfileSchema.parse({ pincode: '12345', confidence: 1 }));
});
