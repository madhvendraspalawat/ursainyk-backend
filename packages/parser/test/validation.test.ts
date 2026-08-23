// Pinned tests for ingestion validation — the wall between raw uploads and
// everything downstream. Synthetic bytes only.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  MAX_PDF_BYTES,
  checkImageBomb,
  scanPdfThreats,
  sniffMime,
  validateResumeFile,
} from '../src/validation';

const PDF_OK = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'latin1');
const PNG_HEADER = (w: number, h: number) => {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); // IHDR length
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test('magic bytes win over declared mime (exe as pdf rejected)', () => {
  const exe = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(64)]);
  const r = validateResumeFile({ kind: 'RESUME_PDF', mime: 'application/pdf', bytes: exe });
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /unrecognized/);
});

test('mime spoof rejected: real png declared as jpeg', () => {
  const r = validateResumeFile({ kind: 'RESUME_PHOTO', mime: 'image/jpeg', bytes: PNG_HEADER(100, 100) });
  assert.equal(r.ok, false);
});

test('sniffMime identifies the four allowed formats', () => {
  assert.equal(sniffMime(PDF_OK), 'application/pdf');
  assert.equal(sniffMime(PNG_HEADER(1, 1)), 'image/png');
  assert.equal(sniffMime(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])), 'image/jpeg');
  const webp = Buffer.alloc(16);
  webp.write('RIFF', 0, 'latin1');
  webp.write('WEBP', 8, 'latin1');
  assert.equal(sniffMime(webp), 'image/webp');
});

test('pdf threat heuristics: scripting/actions/embeds/encryption all rejected', () => {
  for (const token of ['/JavaScript', '/JS ', '/OpenAction', '/Launch', '/EmbeddedFile', '/Encrypt']) {
    const bad = Buffer.from(`%PDF-1.7\n<< ${token} 1 >>`, 'latin1');
    const r = scanPdfThreats(bad);
    assert.equal(r.ok, false, token);
  }
  assert.equal(scanPdfThreats(PDF_OK).ok, true);
});

test('image bomb rejected by dimensions, sane photo passes', () => {
  assert.equal(checkImageBomb(PNG_HEADER(40_000, 40_000), 'image/png').ok, false);
  assert.equal(checkImageBomb(PNG_HEADER(4000, 3000), 'image/png').ok, true);
  assert.equal(checkImageBomb(PNG_HEADER(0, 100), 'image/png').ok, false);
});

test('size cap enforced', () => {
  const huge = Buffer.concat([PDF_OK, Buffer.alloc(MAX_PDF_BYTES)]);
  const r = validateResumeFile({ kind: 'RESUME_PDF', mime: 'application/pdf', bytes: huge });
  assert.equal(r.ok, false);
});

test('clean pdf and clean photo pass end to end', () => {
  assert.equal(
    validateResumeFile({ kind: 'RESUME_PDF', mime: 'application/pdf', bytes: PDF_OK }).ok,
    true,
  );
  assert.equal(
    validateResumeFile({ kind: 'RESUME_PHOTO', mime: 'image/png', bytes: PNG_HEADER(2000, 1000) }).ok,
    true,
  );
});
