import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PlacementListQuery } from '@ursainyk/contracts';
import {
  withGlobalScope,
  withTerritoryScope,
  type Placement,
} from '@ursainyk/db';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../notifications/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

const STAGE_ORDER = [
  'MET',
  'SUITABLE',
  'CALLBACK',
  'PLACED',
  'JOINED',
] as const;
type Stage = (typeof STAGE_ORDER)[number];

/** ESM pipeline (met → suitable → callback → placed → joined). Territory-scoped both layers. */
@Injectable()
export class PlacementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    actor: AuthUser,
    candidateId: string,
    requirementId: string,
  ): Promise<Placement> {
    const created = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      async (tx) => {
        const candidate = await tx.candidate.findFirst({
          where: { id: candidateId, territoryId: { in: actor.territoryIds } },
        });
        if (!candidate) throw new NotFoundException('candidate not found');
        if (candidate.status !== 'APPROVED')
          throw new BadRequestException('candidate must be APPROVED');
        const requirement = await tx.requirement.findFirst({
          where: {
            id: requirementId,
            territoryId: { in: actor.territoryIds },
            status: 'OPEN',
          },
        });
        if (!requirement) throw new NotFoundException('requirement not found');

        const centre = await tx.centreTerritory.findFirst({
          where: {
            territoryId: candidate.territoryId ?? undefined,
            centre: { members: { some: { userId: actor.userId } } },
          },
          select: { centreId: true },
        });
        return tx.placement.create({
          data: {
            candidateId,
            requirementId,
            territoryId: candidate.territoryId,
            centreId: centre?.centreId ?? null,
            createdById: actor.userId,
          },
        });
      },
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'placement.create',
      entity: 'Placement',
      entityId: created.id,
    });
    return created;
  }

  /** Forward-only pipeline; JOINED stamps joinedAt and emits placement.joined. */
  async setStage(
    actor: AuthUser,
    id: string,
    stage: Stage,
  ): Promise<Placement> {
    const updated = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      async (tx) => {
        const row = await tx.placement.findFirst({
          where: { id, territoryId: { in: actor.territoryIds } },
        });
        if (!row) throw new NotFoundException('placement not found');
        const from = STAGE_ORDER.indexOf(row.stage);
        const to = STAGE_ORDER.indexOf(stage);
        if (to <= from)
          throw new BadRequestException(
            `pipeline is forward-only (${row.stage} → ${stage})`,
          );
        const next = await tx.placement.update({
          where: { id },
          data: { stage, ...(stage === 'JOINED' && { joinedAt: new Date() }) },
        });
        if (stage === 'JOINED')
          await this.outbox.emit('placement.joined', { placementId: id }, tx);
        return next;
      },
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'placement.stage',
      entity: 'Placement',
      entityId: id,
      data: { stage },
    });
    return updated;
  }

  /** Scope-routed: ESM territory, contractor own-org supplied heads, admin all. */
  async list(actor: AuthUser, q: PlacementListQuery) {
    const scope = scopeOf(actor.roles, 'placement', 'read');
    const base = {
      ...(q.stage && { stage: q.stage }),
      ...(q.requirementId && { requirementId: q.requirementId }),
      ...(q.cursor && { id: { gt: q.cursor } }),
    };
    let rows: Placement[];
    if (scope === 'territory') {
      rows = await withTerritoryScope(
        this.prisma.db,
        actor.territoryIds,
        (tx) =>
          tx.placement.findMany({
            where: { ...base, territoryId: { in: actor.territoryIds } },
            orderBy: { id: 'asc' },
            take: q.limit,
          }),
      );
    } else if (scope === 'org') {
      rows = await withGlobalScope(this.prisma.db, (tx) =>
        tx.placement.findMany({
          where: { ...base, requirement: { orgId: { in: actor.orgIds } } },
          orderBy: { id: 'asc' },
          take: q.limit,
        }),
      );
    } else if (scope === 'all' || scope === 'own') {
      rows = await withGlobalScope(this.prisma.db, (tx) =>
        tx.placement.findMany({
          where:
            scope === 'own'
              ? { ...base, candidate: { userId: actor.userId } } // candidate status tracker
              : base,
          orderBy: { id: 'asc' },
          take: q.limit,
        }),
      );
    } else {
      throw new ForbiddenException('no placement access');
    }
    return {
      items: rows,
      nextCursor: rows.length === q.limit ? rows[rows.length - 1].id : null,
    };
  }
}
