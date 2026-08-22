import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CandidateListQuery,
  CandidateSelfUpdate,
  WalkInCandidate,
} from '@ursainyk/contracts';
import {
  withGlobalScope,
  withTerritoryScope,
  type Candidate,
} from '@ursainyk/db';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../notifications/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Candidate intake (Phase 1). Scoping follows ADR-0007 twice over:
 * ESM paths run inside withTerritoryScope (Prisma filter + RLS);
 * self/admin paths run withGlobalScope ('*') plus explicit ownership filters.
 * Parser/scoring/review land in their own workstreams.
 */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Self-service (mobile app) ─────────────────────────────────────────────

  /** Own profile; created lazily as DRAFT on first touch. */
  async getSelf(user: AuthUser): Promise<Candidate> {
    return withGlobalScope(this.prisma.db, async (tx) => {
      const existing = await tx.candidate.findUnique({
        where: { userId: user.userId },
      });
      if (existing) return existing;
      const account = await tx.user.findUniqueOrThrow({
        where: { id: user.userId },
      });
      return tx.candidate.create({
        data: {
          userId: user.userId,
          name: account.name,
          phone: account.phone ?? '',
        },
      });
    });
  }

  async updateSelf(
    user: AuthUser,
    patch: CandidateSelfUpdate,
  ): Promise<Candidate> {
    const self = await this.getSelf(user);
    if (self.status === 'PENDING_REVIEW' || self.status === 'APPROVED')
      throw new BadRequestException(
        'profile is locked while under review or approved',
      );
    const updated = await withGlobalScope(this.prisma.db, (tx) =>
      tx.candidate.update({ where: { id: self.id }, data: patch }),
    );
    await this.audit.record({
      actorType: 'user',
      actorId: user.userId,
      action: 'candidate.update',
      entity: 'Candidate',
      entityId: self.id,
    });
    return updated;
  }

  /** Submit for the Reviewer gate; emits candidate.submitted via the outbox. */
  async submitSelf(user: AuthUser): Promise<Candidate> {
    const self = await this.getSelf(user);
    if (self.status !== 'DRAFT' && self.status !== 'REJECTED')
      throw new BadRequestException(`cannot submit from status ${self.status}`);
    if (!self.name)
      throw new BadRequestException('name required before submit');
    const updated = await withGlobalScope(this.prisma.db, async (tx) => {
      const row = await tx.candidate.update({
        where: { id: self.id },
        data: { status: 'PENDING_REVIEW' },
      });
      await this.outbox.emit(
        'candidate.submitted',
        { candidateId: row.id },
        tx,
      );
      return row;
    });
    await this.audit.record({
      actorType: 'user',
      actorId: user.userId,
      action: 'candidate.submit',
      entity: 'Candidate',
      entityId: self.id,
    });
    return updated;
  }

  // ── ESM walk-in intake ────────────────────────────────────────────────────

  async walkIn(actor: AuthUser, input: WalkInCandidate): Promise<Candidate> {
    if (!actor.territoryIds.includes(input.territoryId))
      throw new ForbiddenException('territory outside your centre scope');

    const { phone, territoryId, ...fields } = input;
    const created = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      async (tx) => {
        // Link an existing app account with this phone, if any.
        const account = await tx.user.findUnique({ where: { phone } });
        const linkedUserId =
          account?.kind === 'CANDIDATE' &&
          !(await tx.candidate.findUnique({ where: { userId: account.id } }))
            ? account.id
            : null;
        return tx.candidate.create({
          data: {
            ...fields,
            phone,
            territoryId,
            userId: linkedUserId,
            centreId: await this.centreForTerritory(tx, actor, territoryId),
            createdById: actor.userId,
            status: 'PENDING_REVIEW', // centre completed intake — straight to the gate
          },
        });
      },
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'candidate.walk_in_create',
      entity: 'Candidate',
      entityId: created.id,
    });
    await this.outbox.emit('candidate.submitted', { candidateId: created.id });
    return created;
  }

  // ── Listing / detail (ESM territory-scoped; admin all) ────────────────────

  async list(actor: AuthUser, q: CandidateListQuery) {
    const where = {
      ...(q.status && { status: q.status }),
      ...(q.territoryId && { territoryId: q.territoryId }),
      ...(q.cursor && { id: { gt: q.cursor } }),
      // Query-scoping half of ADR-0007 — RLS is the second, independent layer.
      ...this.territoryFilter(actor),
    };
    const take = q.limit;
    const rows = await this.scopedRead(actor, (tx) =>
      tx.candidate.findMany({ where, orderBy: { id: 'asc' }, take }),
    );
    return {
      items: rows,
      nextCursor: rows.length === take ? rows[rows.length - 1].id : null,
    };
  }

  async getById(actor: AuthUser, id: string): Promise<Candidate> {
    const row = await this.scopedRead(actor, (tx) =>
      tx.candidate.findFirst({ where: { id, ...this.territoryFilter(actor) } }),
    );
    if (!row) throw new NotFoundException('candidate not found'); // also raised by RLS filtering
    return row;
  }

  /** Prisma-level territory restriction for territory-scoped roles (ADR-0007, layer 1 of 2). */
  private territoryFilter(actor: AuthUser): { territoryId?: { in: string[] } } {
    const scope = scopeOf(actor.roles, 'candidate_profile', 'read');
    return scope === 'territory'
      ? { territoryId: { in: actor.territoryIds } }
      : {};
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Route the read through the caller's RBAC scope (ADR-0007). */
  private scopedRead<T>(
    actor: AuthUser,
    fn: (
      tx: Parameters<Parameters<PrismaService['db']['$transaction']>[0]>[0],
    ) => Promise<T>,
  ): Promise<T> {
    const scope = scopeOf(actor.roles, 'candidate_profile', 'read');
    if (scope === 'all') return withGlobalScope(this.prisma.db, fn);
    if (scope === 'territory')
      return withTerritoryScope(this.prisma.db, actor.territoryIds, fn);
    // 'org' (contractor: matched candidates only) arrives with the matching module.
    throw new ForbiddenException('no list access for this role');
  }

  private async centreForTerritory(
    tx: {
      centreTerritory: {
        findFirst: (args: object) => Promise<{ centreId: string } | null>;
      };
    },
    actor: AuthUser,
    territoryId: string,
  ): Promise<string | null> {
    const membershipCentres = await tx.centreTerritory.findFirst({
      where: {
        territoryId,
        centre: { members: { some: { userId: actor.userId } } },
      },
      select: { centreId: true },
    });
    return membershipCentres?.centreId ?? null;
  }
}
