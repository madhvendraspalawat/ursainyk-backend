// Candidate intake boundary schemas. zod at every boundary (CONTRIBUTING).
import { z } from 'zod';
import { PhoneSchema } from './auth';

export const CANDIDATE_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;

/** Self-service profile edit (mobile app, guided form). All fields optional. */
export const CandidateSelfUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    languages: z.array(z.string().min(2).max(20)).max(10).optional(),
    qualification: z.string().max(200).optional(),
    educationLevel: z.string().max(100).optional(),
    totalExpMonths: z.number().int().min(0).max(720).optional(),
    relevantExpMonths: z.number().int().min(0).max(720).optional(),
    city: z.string().max(100).optional(),
    pincode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    locationFlexible: z.boolean().optional(),
  })
  .strict();
export type CandidateSelfUpdate = z.infer<typeof CandidateSelfUpdateSchema>;

/** ESM walk-in intake: centre creates the profile on the candidate's behalf. */
export const WalkInCandidateSchema = CandidateSelfUpdateSchema.extend({
  name: z.string().min(1).max(120),
  phone: PhoneSchema,
  territoryId: z.string().uuid(),
});
export type WalkInCandidate = z.infer<typeof WalkInCandidateSchema>;

export const CandidateListQuerySchema = z.object({
  status: z.enum(CANDIDATE_STATUSES).optional(),
  territoryId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CandidateListQuery = z.infer<typeof CandidateListQuerySchema>;
