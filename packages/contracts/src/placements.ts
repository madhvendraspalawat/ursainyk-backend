// Placement pipeline + verification + matching schemas. zod at every boundary.
import { z } from 'zod';

export const PLACEMENT_STAGES = ['MET', 'SUITABLE', 'CALLBACK', 'PLACED', 'JOINED'] as const;
export const VERIFICATION_OUTCOMES = ['ACTIVE', 'LEFT', 'WON_BACK'] as const;

export const PlacementCreateSchema = z.object({
  candidateId: z.string().uuid(),
  requirementId: z.string().uuid(),
});
export type PlacementCreate = z.infer<typeof PlacementCreateSchema>;

export const PlacementStageSchema = z.object({
  stage: z.enum(PLACEMENT_STAGES),
});
export type PlacementStage = z.infer<typeof PlacementStageSchema>;

export const PlacementListQuerySchema = z.object({
  stage: z.enum(PLACEMENT_STAGES).optional(),
  requirementId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PlacementListQuery = z.infer<typeof PlacementListQuerySchema>;

const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period is YYYY-MM');

export const VerificationCreateSchema = z.object({
  placementId: z.string().uuid(),
  period: PeriodSchema,
  outcome: z.enum(VERIFICATION_OUTCOMES),
  notes: z.string().max(1000).optional(),
});
export type VerificationCreate = z.infer<typeof VerificationCreateSchema>;

export const VerificationDueQuerySchema = z.object({ period: PeriodSchema });

export const SuggestionCreateSchema = z.object({
  requirementId: z.string().uuid(),
  candidateId: z.string().uuid(),
});
export type SuggestionCreate = z.infer<typeof SuggestionCreateSchema>;

export const SuggestionListQuerySchema = z.object({
  requirementId: z.string().uuid().optional(),
  status: z.enum(['SUGGESTED', 'ACCEPTED', 'DISMISSED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SuggestionListQuery = z.infer<typeof SuggestionListQuerySchema>;
