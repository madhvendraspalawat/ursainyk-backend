import { Injectable, NotFoundException } from '@nestjs/common';
import { withGlobalScope } from '@ursainyk/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

@Injectable()
export class CentresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, input: { code: string; name: string }) {
    const row = await this.prisma.db.esmCentre.create({ data: input });
    await this.record(actor, 'centre.create', row.id);
    return row;
  }

  list() {
    return this.prisma.db.esmCentre.findMany({
      include: { territories: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setActive(actor: AuthUser, id: string, active: boolean) {
    const row = await this.prisma.db.esmCentre.update({
      where: { id },
      data: { active },
    });
    await this.record(actor, active ? 'centre.enable' : 'centre.disable', id);
    return row;
  }

  /**
   * These writes ARE the access-control perimeter: they decide which rows every
   * user of this centre can reach through app.territory_ids (ADR-0007).
   */
  async assignTerritory(
    actor: AuthUser,
    centreId: string,
    territoryId: string,
  ) {
    const territory = await this.prisma.db.territory.findUnique({
      where: { id: territoryId },
    });
    if (!territory) throw new NotFoundException('territory not found');
    await this.prisma.db.centreTerritory.upsert({
      where: { centreId_territoryId: { centreId, territoryId } },
      update: {},
      create: { centreId, territoryId },
    });
    await this.record(actor, 'centre.territory_assign', centreId, {
      territoryId,
    });
  }

  async unassignTerritory(
    actor: AuthUser,
    centreId: string,
    territoryId: string,
  ) {
    await this.prisma.db.centreTerritory.deleteMany({
      where: { centreId, territoryId },
    });
    await this.record(actor, 'centre.territory_unassign', centreId, {
      territoryId,
    });
  }

  /** Performance snapshot: candidates / pipeline / verification coverage. */
  async summary(centreId: string) {
    return withGlobalScope(this.prisma.db, async (tx) => {
      const centre = await tx.esmCentre.findUnique({ where: { id: centreId } });
      if (!centre) throw new NotFoundException('centre not found');
      const [candidates, placementsByStage, verifications] = await Promise.all([
        tx.candidate.count({ where: { centreId } }),
        tx.placement.groupBy({
          by: ['stage'],
          where: { centreId },
          _count: true,
        }),
        tx.verification.count({ where: { placement: { centreId } } }),
      ]);
      return { centre, candidates, placementsByStage, verifications };
    });
  }

  private record(
    actor: AuthUser,
    action: string,
    entityId: string,
    data?: object,
  ) {
    return this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action,
      entity: 'EsmCentre',
      entityId,
      data: data,
    });
  }
}
