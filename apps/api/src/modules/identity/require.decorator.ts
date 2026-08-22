import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@ursainyk/rbac';

export const REQUIRE_KEY = 'require_permissions';

/**
 * Declare the permission a route needs, e.g. `@Require('placement:update')`.
 * Enforced by PermissionsGuard against the @ursainyk/rbac matrix.
 * Controllers declare; they never check inline.
 */
export const Require = (...permissions: Permission[]) =>
  SetMetadata(REQUIRE_KEY, permissions);
