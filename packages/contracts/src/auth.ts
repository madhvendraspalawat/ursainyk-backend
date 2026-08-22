// Auth boundary schemas (ADR-0004). zod at every boundary (CONTRIBUTING).
import { z } from 'zod';

/** E.164, India-first. */
export const PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164');

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: z.string().regex(/^\d{6}$/, 'code is 6 digits'),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export const PasswordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  /** TOTP code — mandatory for admin roles (ADR-0004). */
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type PasswordLogin = z.infer<typeof PasswordLoginSchema>;

export const TotpActivateSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'code is 6 digits'),
});
export type TotpActivate = z.infer<typeof TotpActivateSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type Refresh = z.infer<typeof RefreshSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(), // seconds
});
export type TokenPair = z.infer<typeof TokenPairSchema>;
