// Audit + decision-capture boundary schemas (ADR-0012).
import { z } from 'zod';

export const DECISION_TYPES = [
  'REVIEWER_CORRECTION',
  'MATCHING',
  'VERIFICATION_OUTCOME',
  'SCORING_OVERRIDE',
] as const;

export const AuditLogQuerySchema = z.object({
  entity: z.string().max(64).optional(),
  entityId: z.string().max(128).optional(),
  /** Prefix match on the dotted action verb, e.g. 'auth.' */
  action: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Last seen id — pagination walks ids descending. */
  cursor: z.coerce.bigint().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const DecisionExportQuerySchema = z.object({
  type: z.enum(DECISION_TYPES),
  consentBasis: z.string().max(64).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type DecisionExportQuery = z.infer<typeof DecisionExportQuerySchema>;

export const EraseSubjectSchema = z.object({
  subjectType: z.string().min(1).max(64),
  subjectId: z.string().min(1).max(128),
});
export type EraseSubject = z.infer<typeof EraseSubjectSchema>;
