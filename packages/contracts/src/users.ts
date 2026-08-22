// User-management boundary schemas (identity module). zod at every boundary (CONTRIBUTING).
import { z } from 'zod';

/** Roles assignable to portal users. CANDIDATE accounts are created only via OTP self-registration. */
export const PORTAL_ROLES = [
  'ESM_CENTRE',
  'CONTRACTOR',
  'REVIEWER',
  'OPS',
  'FINANCE',
  'ESM_MANAGER',
  'SALES_BD',
  'SUPER_ADMIN',
] as const;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  roles: z.array(z.enum(PORTAL_ROLES)).min(1).max(4),
  /** Required when roles include ESM_CENTRE. */
  centreId: z.string().uuid().optional(),
  /** Required when roles include CONTRACTOR. */
  orgId: z.string().uuid().optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

export const GrantRoleSchema = z.object({
  role: z.enum(PORTAL_ROLES),
});
export type GrantRole = z.infer<typeof GrantRoleSchema>;

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
});
export type UpdateUserStatus = z.infer<typeof UpdateUserStatusSchema>;

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(10).max(128),
});
export type PasswordChange = z.infer<typeof PasswordChangeSchema>;
