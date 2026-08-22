import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ursainyk/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Territory definitions (they key the whole RLS perimeter, ADR-0007) and the
 * SystemConfig KV (billing rates, feature flags `flags.*`, language packs
 * later). Config writes are SUPER-visibility audit events — config is power.
 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createTerritory(
    actor: AuthUser,
    input: { code: string; name: string },
  ) {
    const row = await this.prisma.db.territory.create({ data: input });
    await this.record(actor, 'territory.create', 'Territory', row.id);
    return row;
  }

  listTerritories() {
    return this.prisma.db.territory.findMany({ orderBy: { code: 'asc' } });
  }

  async patchTerritory(
    actor: AuthUser,
    id: string,
    data: { name?: string; active?: boolean },
  ) {
    const row = await this.prisma.db.territory.update({ where: { id }, data });
    await this.record(actor, 'territory.update', 'Territory', id);
    return row;
  }

  listConfig() {
    return this.prisma.db.systemConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async getConfig(key: string) {
    const row = await this.prisma.db.systemConfig.findUnique({
      where: { key },
    });
    if (!row) throw new NotFoundException('config key not found');
    return row;
  }

  async putConfig(actor: AuthUser, key: string, value: unknown) {
    const row = await this.prisma.db.systemConfig.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'config.update',
      entity: 'SystemConfig',
      entityId: key,
      visibility: 'SUPER', // config changes are high-signal
    });
    return row;
  }

  private record(
    actor: AuthUser,
    action: string,
    entity: string,
    entityId: string,
  ) {
    return this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action,
      entity,
      entityId,
    });
  }
}
