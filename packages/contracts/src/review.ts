// Reviewer gate boundary schemas (the human-in-the-loop, ADR-0008).
import { z } from 'zod';
import { CandidateSelfUpdateSchema } from './candidates';

export const ReviewApproveSchema = z.object({
  /** Field corrections applied at approval — the parser-vs-human training diff (ADR-0012). */
  corrections: CandidateSelfUpdateSchema.optional(),
  rationale: z.string().max(2000).optional(),
});
export type ReviewApprove = z.infer<typeof ReviewApproveSchema>;

export const ReviewRejectSchema = z.object({
  rationale: z.string().min(3).max(2000),
});
export type ReviewReject = z.infer<typeof ReviewRejectSchema>;

export const ReviewQueueQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuerySchema>;
