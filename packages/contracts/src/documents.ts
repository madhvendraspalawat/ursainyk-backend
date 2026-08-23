// Document upload boundary schemas (résumé → parser pipeline, ADR-0008).
import { z } from 'zod';

export const DOCUMENT_KINDS = ['RESUME_PHOTO', 'RESUME_PDF'] as const;

const MIME_BY_KIND: Record<(typeof DOCUMENT_KINDS)[number], string[]> = {
  RESUME_PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  RESUME_PDF: ['application/pdf'],
};

export const DocumentUploadRequestSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    mime: z.string().max(60),
    /** ESM walk-in: upload on a candidate's behalf. Candidates upload for themselves. */
    candidateId: z.string().uuid().optional(),
  })
  .refine((v) => MIME_BY_KIND[v.kind].includes(v.mime), {
    message: 'mime does not match document kind',
  });
export type DocumentUploadRequest = z.infer<typeof DocumentUploadRequestSchema>;
