import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, name: string) {
    const row = await this.prisma.db.contractorOrg.create({ data: { name } });
    await this.record(actor, 'org.create', row.id);
    return row;
  }

  list() {
    // Employer identity intentionally NOT included — separate masked table (ADR-0007).
    return this.prisma.db.contractorOrg.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async patch(
    actor: AuthUser,
    id: string,
    data: { name?: string; active?: boolean },
  ) {
    const row = await this.prisma.db.contractorOrg.update({
      where: { id },
      data,
    });
    await this.record(actor, 'org.update', id);
    return row;
  }

  async putEmployer(
    actor: AuthUser,
    orgId: string,
    identity: {
      companyName: string;
      contactName?: string;
      contactPhone?: string;
    },
  ) {
    const org = await this.prisma.db.contractorOrg.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('org not found');
    const row = await this.prisma.db.employerIdentity.upsert({
      where: { orgId },
      update: identity,
      create: { orgId, ...identity },
    });
    await this.record(actor, 'org.employer_update', orgId);
    return row;
  }

  private record(actor: AuthUser, action: string, entityId: string) {
    return this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action,
      entity: 'ContractorOrg',
      entityId,
    });
  }
}
