import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Worker, type Job } from 'bullmq';
import type IORedis from 'ioredis';
import type { Db } from '@ursainyk/db';
import { createResumeParser, type ParsedProfile } from '@ursainyk/parser';
import type { OutboxJob } from './notifications-worker';

export const PARSER_QUEUE = 'parser';

/**
 * Async résumé parsing (ADR-0008): download from S3, run the parser behind
 * the interface (Claude vision when ANTHROPIC_API_KEY is set, deterministic
 * stub otherwise), and PROPOSE fields onto the candidate — only where the
 * human hasn't already written something. Parser output is never
 * authoritative; the Reviewer gate decides. At-least-once safe: reprocessing
 * a PARSED document is a no-op.
 */
export function startParserWorker(connection: IORedis, db: Db): Worker<OutboxJob> {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'ap-south-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minio',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minio12345',
    },
  });
  const bucket = process.env.S3_BUCKET ?? 'nabhahita-documents';
  const parser = createResumeParser();

  return new Worker<OutboxJob>(
    PARSER_QUEUE,
    async (job: Job<OutboxJob>) => {
      const { documentId } = job.data.payload as { documentId: string };
      const doc = await db.document.findUnique({ where: { id: documentId } });
      if (!doc || doc.status === 'PARSED') return; // idempotent replay

      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: doc.s3Key }));
        const bytes = Buffer.from(await object.Body!.transformToByteArray());
        const parsed = await parser.parse({ kind: doc.kind, mime: doc.mime, bytes });
        await applyProposal(db, doc.candidateId, doc.id, parsed, parser.name);
      } catch (e) {
        await db.document.update({
          where: { id: doc.id },
          data: { status: 'FAILED', error: String(e).slice(0, 500) },
        });
        throw e; // BullMQ retries; rate limits degrade to slow, never dropped
      }
    },
    {
      connection,
      concurrency: 2, // vision-LLM rate limits: low parallelism, queue absorbs bursts
      // Retry with backoff comes from the queue's defaultJobOptions set by the relay.
    },
  );
}

/** Fill only empty fields — never overwrite what a human already entered. */
async function applyProposal(
  db: Db,
  candidateId: string,
  documentId: string,
  parsed: ParsedProfile,
  parserName: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.territory_ids = '*'`);
    const candidate = await tx.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    const { confidence, ...fields } = parsed;
    const proposal = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => {
        if (value === undefined) return false;
        const current = candidate[key as keyof typeof candidate];
        return current === null || current === '' || (Array.isArray(current) && current.length === 0);
      }),
    );
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        ...proposal,
        // Raw parser output kept verbatim for the Reviewer diff + training set (ADR-0012).
        profile: { parser: parserName, confidence, parsed: fields },
      },
    });
    await tx.document.update({ where: { id: documentId }, data: { status: 'PARSED' } });
    await tx.auditLog.create({
      data: {
        actorType: 'service',
        actorId: `worker:${parserName}`,
        action: 'parser.parsed',
        entity: 'Document',
        entityId: documentId,
        data: { confidence, fieldsProposed: Object.keys(proposal) },
        visibility: 'SUPER',
      },
    });
  });
}
