import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  RequirementCreate,
  RequirementListQuery,
  RequirementUpdate,
} from '@ursainyk/contracts';
import {
  withGlobalScope,
  withTerritoryScope,
  type Requirement,
} from '@ursainyk/db';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Employer masking (ADR-0006/0007): the ESM/candidate-facing DTO carries NO
 * orgId — a stable uuid is correlatable identity. Unmasking is an explicit
 * endpoint audited as masked_employer.read (SUPER-tier signal).
 */
export interface MaskedRequirementDto {
  id: string;
  roleTitle: string;
  headcount: number;
  city: string | null;
  territoryId: string | null;
  salaryMinPaise: string | null;
  salaryMaxPaise: string | null;
  terms: string | null;
  status: string;
  createdAt: Date;
}

export interface OwnerRequirementDto extends MaskedRequirementDto {
  orgId: string;
}

function toMasked(r: Requirement): MaskedRequirementDto {
  return {
    id: r.id,
    roleTitle: r.roleTitle,
    headcount: r.headcount,
    city: r.city,
    territoryId: r.territoryId,
    salaryMinPaise: r.salaryMinPaise?.toString() ?? null,
    salaryMaxPaise: r.salaryMaxPaise?.toString() ?? null,
    terms: r.terms,
    status: r.status,
    createdAt: r.createdAt,
  };
}

function toOwner(r: Requirement): OwnerRequirementDto {
  return { ...toMasked(r), orgId: r.orgId };
}

@Injectable()
export class RequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: AuthUser,
    input: RequirementCreate,
  ): Promise<OwnerRequirementDto> {
    const scope = scopeOf(actor.roles, 'requirement', 'create');
    let orgId: string;
    if (scope === 'all') {
      // Sales BD / privileged: must say whose requirement this is.
      if (!input.orgId) throw new BadRequestException('orgId required');
      orgId = input.orgId;
    } else {
      // Contractor: own org only, regardless of payload.
      orgId = actor.orgIds[0];
      if (!orgId) throw new ForbiddenException('no contractor org membership');
      if (input.orgId && input.orgId !== orgId)
        throw new ForbiddenException('cannot post for another org');
    }
    const { orgId: _ignored, ...fields } = input;
    void _ignored; // payload orgId resolved above, never trusted directly
    const row = await withGlobalScope(this.prisma.db, (tx) =>
      tx.requirement.create({
        data: { ...fields, orgId, createdById: actor.userId },
      }),
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'requirement.create',
      entity: 'Requirement',
      entityId: row.id,
    });
    return toOwner(row);
  }

  async update(
    actor: AuthUser,
    id: string,
    patch: RequirementUpdate,
  ): Promise<OwnerRequirementDto> {
    const row = await this.ownedRequirement(actor, id);
    const updated = await withGlobalScope(this.prisma.db, (tx) =>
      tx.requirement.update({ where: { id: row.id }, data: patch }),
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action:
        patch.status === 'CLOSED' ? 'requirement.close' : 'requirement.update',
      entity: 'Requirement',
      entityId: row.id,
    });
    return toOwner(updated);
  }

  /**
   * One endpoint, three views: contractor = own org (full), ESM = territory
   * feed (masked), admin = everything (full).
   */
  async list(actor: AuthUser, q: RequirementListQuery) {
    const scope = scopeOf(actor.roles, 'requirement', 'read');
    const base = {
      ...(q.status && { status: q.status }),
      ...(q.cursor && { id: { gt: q.cursor } }),
    };
    if (scope === 'org') {
      const rows = await withGlobalScope(this.prisma.db, (tx) =>
        tx.requirement.findMany({
          where: { ...base, orgId: { in: actor.orgIds } },
          orderBy: { id: 'asc' },
          take: q.limit,
        }),
      );
      return this.page(rows.map(toOwner), rows.length, q.limit);
    }
    if (scope === 'territory') {
      const rows = await withTerritoryScope(
        this.prisma.db,
        actor.territoryIds,
        (tx) =>
          tx.requirement.findMany({
            where: {
              ...base,
              status: 'OPEN',
              territoryId: { in: actor.territoryIds },
            },
            orderBy: { id: 'asc' },
            take: q.limit,
          }),
      );
      return this.page(rows.map(toMasked), rows.length, q.limit); // masked feed
    }
    if (scope === 'all') {
      const rows = await withGlobalScope(this.prisma.db, (tx) =>
        tx.requirement.findMany({
          where: base,
          orderBy: { id: 'asc' },
          take: q.limit,
        }),
      );
      return this.page(rows.map(toOwner), rows.length, q.limit);
    }
    throw new ForbiddenException('no requirement access');
  }

  async getById(actor: AuthUser, id: string) {
    const scope = scopeOf(actor.roles, 'requirement', 'read');
    if (scope === 'territory') {
      const row = await withTerritoryScope(
        this.prisma.db,
        actor.territoryIds,
        (tx) =>
          tx.requirement.findFirst({
            where: { id, territoryId: { in: actor.territoryIds } },
          }),
      );
      if (!row) throw new NotFoundException('requirement not found');
      return toMasked(row);
    }
    const row = await withGlobalScope(this.prisma.db, (tx) =>
      tx.requirement.findUnique({ where: { id } }),
    );
    if (!row) throw new NotFoundException('requirement not found');
    if (scope === 'org' && !actor.orgIds.includes(row.orgId))
      throw new NotFoundException('requirement not found'); // 404, not 403 — no existence oracle
    if (scope !== 'org' && scope !== 'all')
      throw new ForbiddenException('no requirement access');
    return toOwner(row);
  }

  /** The masked join (ADR-0007). Every read lands in the audit chain as SUPER-tier. */
  async unmaskEmployer(actor: AuthUser, id: string) {
    const scope = scopeOf(actor.roles, 'employer_identity', 'read');
    const row = await withGlobalScope(this.prisma.db, (tx) =>
      tx.requirement.findUnique({
        where: { id },
        include: { org: { include: { employer: true } } },
      }),
    );
    if (!row) throw new NotFoundException('requirement not found');
    if (scope !== 'all' && !actor.orgIds.includes(row.orgId))
      throw new NotFoundException('requirement not found');
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'masked_employer.read', // prefix forces SUPER visibility (bypass-detection signal)
      entity: 'Requirement',
      entityId: row.id,
    });
    return {
      requirementId: row.id,
      orgId: row.orgId,
      companyName: row.org.employer?.companyName ?? row.org.name,
      contactName: row.org.employer?.contactName ?? null,
      contactPhone: row.org.employer?.contactPhone ?? null,
    };
  }

  private async ownedRequirement(
    actor: AuthUser,
    id: string,
  ): Promise<Requirement> {
    const scope = scopeOf(actor.roles, 'requirement', 'update');
    const row = await withGlobalScope(this.prisma.db, (tx) =>
      tx.requirement.findUnique({ where: { id } }),
    );
    if (!row) throw new NotFoundException('requirement not found');
    if (scope !== 'all' && !actor.orgIds.includes(row.orgId))
      throw new NotFoundException('requirement not found');
    return row;
  }

  private page<T>(items: T[], got: number, limit: number) {
    const last = items[items.length - 1] as { id?: string } | undefined;
    return { items, nextCursor: got === limit ? (last?.id ?? null) : null };
  }
}
