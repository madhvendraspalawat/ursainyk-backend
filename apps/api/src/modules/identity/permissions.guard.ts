import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canPermission, type Permission } from '@ursainyk/rbac';
import type { AuthUser } from './auth-user';
import { REQUIRE_KEY } from './require.decorator';

/**
 * Enforces @Require() permissions against the RBAC matrix. Runs after
 * JwtAuthGuard (needs request.user). Scope (own/territory/org) is enforced
 * at the data layer (ADR-0007), not here — this guard answers only
 * "may this role set perform this action at all".
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new ForbiddenException('no authenticated principal');

    for (const permission of required) {
      if (!canPermission(user.roles, permission)) {
        throw new ForbiddenException(`missing permission: ${permission}`);
      }
    }
    return true;
  }
}
