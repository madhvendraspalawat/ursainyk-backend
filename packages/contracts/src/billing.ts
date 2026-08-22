// Billing / payouts / scoring-config / admin-org / system-config schemas.
import { z } from 'zod';

const PeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period is YYYY-MM');

export const BillingRunSchema = z.object({
  period: PeriodSchema,
  /** Client-supplied — rerunning with the same key writes nothing twice (ADR-0005). */
  idempotencyKey: z.string().min(8).max(100),
});
export type BillingRun = z.infer<typeof BillingRunSchema>;

export const LedgerQuerySchema = z.object({
  period: PeriodSchema.optional(),
  orgId: z.string().uuid().optional(),
  centreId: z.string().uuid().optional(),
});
export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;

export const ScoringWeightsSchema = z.object({
  qualification: z.number().int().min(0).max(100),
  education: z.number().int().min(0).max(100),
  totalExp: z.number().int().min(0).max(100),
  relevantExp: z.number().int().min(0).max(100),
  language: z.number().int().min(0).max(100),
  locationFlexibility: z.number().int().min(0).max(100),
});

export const ScoringPresetPutSchema = z.object({
  name: z.string().min(1).max(60),
  weights: ScoringWeightsSchema,
});
export type ScoringPresetPut = z.infer<typeof ScoringPresetPutSchema>;

export const ScoreOverrideSchema = z.object({
  score: z.number().int().min(0).max(900),
  rationale: z.string().min(3).max(2000),
});
export type ScoreOverride = z.infer<typeof ScoreOverrideSchema>;

// ── Admin: centres / territories / orgs / config ────────────────────────────

export const CentreCreateSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(120),
});
export const CentrePatchSchema = z.object({ active: z.boolean() });

export const TerritoryCreateSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(120),
});
export const TerritoryPatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  active: z.boolean().optional(),
});

export const OrgCreateSchema = z.object({ name: z.string().min(2).max(160) });
export const OrgPatchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  active: z.boolean().optional(),
});
export const EmployerIdentityPutSchema = z.object({
  companyName: z.string().min(2).max(160),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
});

export const ConfigPutSchema = z.object({ value: z.unknown() });
