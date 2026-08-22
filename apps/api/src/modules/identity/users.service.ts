import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { CreateUser } from '@ursainyk/contracts';
import type { Role } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import type { AuthUser } from './auth-user';

/**
 * Portal-user lifecycle. The RBAC matrix says WHO may create accounts
 * (user_account:create); this service enforces WHICH roles each creator may
 * hand out: ESM_MANAGER → ESM_CENTRE only, SALES_BD → CONTRACTOR only,
 * SUPER_ADMIN → any. Role grant/revoke after creation is Super Admin only
 * (user_account:configure). Every mutation is audited (ADR-0006: role
 * assignments are audited facts).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async createPortalUser(
    actor: AuthUser,
    input: CreateUser,
  ): Promise<{ id: string; tempPassword: string }> {
    this.assertCreatableRoles(actor, input.roles);
    if (input.roles.includes('ESM_CENTRE') && !input.centreId)
      throw new BadRequestException('centreId required for ESM_CENTRE');
    if (input.roles.includes('CONTRACTOR') && !input.orgId)
      throw new BadRequestException('orgId required for CONTRACTOR');

    const tempPassword = randomBytes(9).toString('base64url'); // returned once, never logged
    const passwordHash = await argon2.hash(tempPassword, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.db.user.create({
      data: {
        kind: 'PORTAL',
        email: input.email,
        name: input.name,
        credential: { create: { passwordHash } },
        roles: {
          create: input.roles.map((role) => ({
            role,
            grantedById: actor.userId,
          })),
        },
        ...(input.centreId && {
          centreMemberships: { create: [{ centreId: input.centreId }] },
        }),
        ...(input.orgId && {
          contractorMemberships: { create: [{ orgId: input.orgId }] },
        }),
      },
    });

    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'user.create',
      entity: 'User',
      entityId: user.id,
    });
    for (const role of input.roles)
      await this.auditGrant(actor, user.id, role, 'role.grant');
    return { id: user.id, tempPassword };
  }

  async grantRole(actor: AuthUser, userId: string, role: Role): Promise<void> {
    await this.mustExist(userId);
    await this.prisma.db.roleAssignment.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role, grantedById: actor.userId },
    });
    await this.auditGrant(actor, userId, role, 'role.grant');
  }

  async revokeRole(actor: AuthUser, userId: string, role: Role): Promise<void> {
    const { count } = await this.prisma.db.roleAssignment.deleteMany({
      where: { userId, role },
    });
    if (count === 0) throw new NotFoundException('assignment not found');
    await this.tokens.revokeAll(userId); // old JWTs still carry the role until expiry; refresh path re-reads
    await this.auditGrant(actor, userId, role, 'role.revoke');
  }

  async setStatus(
    actor: AuthUser,
    userId: string,
    status: 'ACTIVE' | 'DISABLED',
  ): Promise<void> {
    await this.mustExist(userId);
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status },
    });
    if (status === 'DISABLED') await this.tokens.revokeAll(userId); // forced logout
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: status === 'DISABLED' ? 'user.disable' : 'user.enable',
      entity: 'User',
      entityId: userId,
    });
  }

  async resetPassword(
    actor: AuthUser,
    userId: string,
  ): Promise<{ tempPassword: string }> {
    const user = await this.mustExist(userId);
    if (user.kind !== 'PORTAL')
      throw new BadRequestException('candidates have no password');
    const tempPassword = randomBytes(9).toString('base64url');
    await this.prisma.db.credential.update({
      where: { userId },
      data: {
        passwordHash: await argon2.hash(tempPassword, {
          type: argon2.argon2id,
        }),
      },
    });
    await this.tokens.revokeAll(userId);
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'user.password_reset',
      entity: 'User',
      entityId: userId,
    });
    return { tempPassword };
  }

  private assertCreatableRoles(actor: AuthUser, roles: Role[]): void {
    if (actor.roles.includes('SUPER_ADMIN')) return;
    const allowed: Role[] = actor.roles.includes('ESM_MANAGER')
      ? ['ESM_CENTRE']
      : actor.roles.includes('SALES_BD')
        ? ['CONTRACTOR']
        : [];
    const outside = roles.filter((r) => !allowed.includes(r));
    if (outside.length > 0)
      throw new ForbiddenException(
        `cannot assign roles: ${outside.join(', ')}`,
      );
  }

  private async mustExist(userId: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  private async auditGrant(
    actor: AuthUser,
    userId: string,
    role: Role,
    action: string,
  ) {
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action,
      entity: 'User',
      entityId: userId,
      data: { role },
    });
  }
}
