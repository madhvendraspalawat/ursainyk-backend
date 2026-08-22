import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@ursainyk/rbac';

/** Authenticated principal attached to the request by JwtStrategy. */
export interface AuthUser {
  userId: string;
  kind: 'CANDIDATE' | 'PORTAL';
  roles: Role[];
  /** From centre memberships — feeds Prisma scoping + RLS (ADR-0007). */
  territoryIds: string[];
  /** From contractor-org memberships. */
  orgIds: string[];
}

/** JWT payload shape (kept short — tokens travel on every request). */
export interface JwtPayload {
  sub: string;
  kind: AuthUser['kind'];
  roles: Role[];
  tid: string[];
  oid: string[];
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
