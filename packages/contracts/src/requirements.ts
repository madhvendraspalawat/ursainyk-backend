// Requirement lifecycle + masked feed schemas. zod at every boundary.
import { z } from 'zod';

export const REQUIREMENT_STATUSES = ['OPEN', 'CLOSED'] as const;

export const RequirementCreateSchema = z.object({
  roleTitle: z.string().min(2).max(120),
  headcount: z.number().int().min(1).max(10_000),
  city: z.string().max(100).optional(),
  territoryId: z.string().uuid().optional(),
  /** Paise as strings — BigInt does not survive JSON. */
  salaryMinPaise: z.coerce.bigint().nonnegative().optional(),
  salaryMaxPaise: z.coerce.bigint().nonnegative().optional(),
  terms: z.string().max(2000).optional(),
  /** Sales BD only: post on behalf of this org. Contractors use their own org. */
  orgId: z.string().uuid().optional(),
});
export type RequirementCreate = z.infer<typeof RequirementCreateSchema>;

export const RequirementUpdateSchema = RequirementCreateSchema.omit({ orgId: true })
  .partial()
  .extend({ status: z.enum(REQUIREMENT_STATUSES).optional() });
export type RequirementUpdate = z.infer<typeof RequirementUpdateSchema>;

export const RequirementListQuerySchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type RequirementListQuery = z.infer<typeof RequirementListQuerySchema>;
