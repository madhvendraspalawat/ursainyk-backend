// File-ingestion validation (defensive): user uploads go straight to S3 via
// presigned URLs, so NOTHING about the bytes is trusted until this stage runs.
// Pure functions — pinned tests in test/validation.test.ts.
import type { ResumeDocument } from './index';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
/** Decompression-bomb guard: a résumé photo has no business being this large. */
const MAX_IMAGE_SIDE_PX = 12_000;
const MAX_IMAGE_PIXELS = 50_000_000; // 50 MP

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Full pre-parse validation: size cap, magic-byte/mime agreement, PDF threat
 * heuristics, image decompression-bomb guard. Antivirus runs separately
 * (worker) because it needs the clamd daemon.
 */
export function validateResumeFile(doc: ResumeDocument): ValidationResult {
  const cap = doc.kind === 'RESUME_PDF' ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  if (doc.bytes.length === 0) return { ok: false, reason: 'empty file' };
  if (doc.bytes.length > cap) return { ok: false, reason: `file exceeds ${cap} bytes` };

  const sniffed = sniffMime(doc.bytes);
  if (!sniffed) return { ok: false, reason: 'unrecognized file signature' };
  if (sniffed !== doc.mime)
    return { ok: false, reason: `content is ${sniffed}, declared ${doc.mime}` };
  if (doc.kind === 'RESUME_PDF' && sniffed !== 'application/pdf')
    return { ok: false, reason: 'kind/content mismatch' };
  if (doc.kind === 'RESUME_PHOTO' && sniffed === 'application/pdf')
    return { ok: false, reason: 'kind/content mismatch' };

  if (sniffed === 'application/pdf') return scanPdfThreats(doc.bytes);
  return checkImageBomb(doc.bytes, sniffed);
}

/** True content type from magic bytes — never from the client's declaration. */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/**
 * PDF threat heuristics: a résumé never needs scripting, auto-actions,
 * embedded files, or encryption. Presence of any is grounds for rejection —
 * cheap to check, blocks the classic malicious-PDF families outright.
 */
export function scanPdfThreats(bytes: Buffer): ValidationResult {
  const text = bytes.toString('latin1');
  const threats: Array<[RegExp, string]> = [
    [/\/JavaScript\b/, 'embedded JavaScript'],
    [/\/JS\b/, 'embedded JavaScript'],
    [/\/OpenAction\b/, 'auto-open action'],
    [/\/AA\b/, 'additional actions'],
    [/\/Launch\b/, 'launch action'],
    [/\/EmbeddedFiles?\b/, 'embedded files'],
    [/\/RichMedia\b/, 'rich media'],
    [/\/XFA\b/, 'XFA forms'],
    [/\/Encrypt\b/, 'encrypted PDF'],
  ];
  for (const [pattern, label] of threats) {
    if (pattern.test(text)) return { ok: false, reason: `pdf contains ${label}` };
  }
  return { ok: true };
}

/** Reject absurd pixel dimensions before any decoder touches the file. */
export function checkImageBomb(bytes: Buffer, mime: string): ValidationResult {
  const dims = mime === 'image/png' ? pngDimensions(bytes) : mime === 'image/jpeg' ? jpegDimensions(bytes) : null;
  if (!dims) return { ok: true }; // webp / undeterminable: covered by the byte cap
  const { width, height } = dims;
  if (width === 0 || height === 0) return { ok: false, reason: 'invalid image dimensions' };
  if (width > MAX_IMAGE_SIDE_PX || height > MAX_IMAGE_SIDE_PX || width * height > MAX_IMAGE_PIXELS)
    return { ok: false, reason: `image dimensions ${width}x${height} exceed limits` };
  return { ok: true };
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  // IHDR is always the first chunk: width/height at offsets 16/20.
  if (bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  // Walk segments to the first SOFn marker (C0–CF except C4/C8/CC).
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}
