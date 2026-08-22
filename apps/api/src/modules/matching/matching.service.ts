import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SuggestionListQuery } from '@ursainyk/contracts';
import {
  withGlobalScope,
  withTerritoryScope,
  type MatchSuggestion,
} from '@ursainyk/db';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { DecisionService } from '../audit/decision.service';
import { PlacementsService } from '../placements/placements.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Phase-1 manual-assisted matching: Ops proposes (placement:read only per the
 * matrix — proposing is not placing), ESM accepts into their own pipeline.
 * Every step is a MATCHING DecisionEvent (ADR-0012) — the future auto-matcher
 * trains on exactly these accept/dismiss signals.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly decisions: DecisionService,
    private readonly placements: PlacementsService,
  ) {}

  async suggest(
    actor: AuthUser,
    requirementId: string,
    candidateId: string,
  ): Promise<MatchSuggestion> {
    const row = await withGlobalScope(this.prisma.db, async (tx) => {
      const [requirement, candidate] = await Promise.all([
        tx.requirement.findFirst({
          where: { id: requirementId, status: 'OPEN' },
        }),
        tx.candidate.findFirst({
          where: { id: candidateId, status: 'APPROVED' },
        }),
      ]);
      if (!requirement)
        throw new NotFoundException('open requirement not found');
      if (!candidate)
        throw new NotFoundException('approved candidate not found');
      return tx.matchSuggestion.upsert({
        where: { requirementId_candidateId: { requirementId, candidateId } },
        update: {},
        create: { requirementId, candidateId, suggestedById: actor.userId },
      });
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'match.suggest',
      entity: 'MatchSuggestion',
      entityId: row.id,
    });
    await this.recordMatchingDecision(actor, row, 'suggested');
    return row;
  }

  /** ESM decision. Accept creates the placement through the normal territory-fenced path. */
  async decide(actor: AuthUser, id: string, decision: 'accept' | 'dismiss') {
    const suggestion = await withGlobalScope(this.prisma.db, (tx) =>
      tx.matchSuggestion.findUnique({
        where: { id },
        include: { candidate: true, requirement: true },
      }),
    );
    if (!suggestion) throw new NotFoundException('suggestion not found');
    if (suggestion.status !== 'SUGGESTED')
      throw new BadRequestException(
        `already ${suggestion.status.toLowerCase()}`,
      );
    // Territory fence: the suggestion must be workable by THIS centre.
    if (
      scopeOf(actor.roles, 'match_suggestion', 'update') === 'territory' &&
      (!suggestion.candidate.territoryId ||
        !actor.territoryIds.includes(suggestion.candidate.territoryId))
    )
      throw new NotFoundException('suggestion not found');

    let placementId: string | null = null;
    if (decision === 'accept') {
      const placement = await this.placements.create(
        actor,
        suggestion.candidateId,
        suggestion.requirementId,
      );
      placementId = placement.id;
    }
    const updated = await withGlobalScope(this.prisma.db, (tx) =>
      tx.matchSuggestion.update({
        where: { id },
        data: { status: decision === 'accept' ? 'ACCEPTED' : 'DISMISSED' },
      }),
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: `match.${decision}`,
      entity: 'MatchSuggestion',
      entityId: id,
      data: placementId ? { placementId } : undefined,
    });
    await this.recordMatchingDecision(
      actor,
      updated,
      decision === 'accept' ? 'accepted' : 'dismissed',
    );
    return updated;
  }

  async list(actor: AuthUser, q: SuggestionListQuery) {
    const territoryFence =
      scopeOf(actor.roles, 'match_suggestion', 'read') === 'territory'
        ? { candidate: { territoryId: { in: actor.territoryIds } } }
        : {};
    const rows = await (scopeOf(actor.roles, 'match_suggestion', 'read') ===
    'territory'
      ? withTerritoryScope(this.prisma.db, actor.territoryIds, (tx) =>
          tx.matchSuggestion.findMany({
            where: {
              ...(q.requirementId && { requirementId: q.requirementId }),
              ...(q.status && { status: q.status }),
              ...territoryFence,
            },
            orderBy: { id: 'asc' },
            take: q.limit,
          }),
        )
      : withGlobalScope(this.prisma.db, (tx) =>
          tx.matchSuggestion.findMany({
            where: {
              ...(q.requirementId && { requirementId: q.requirementId }),
              ...(q.status && { status: q.status }),
            },
            orderBy: { id: 'asc' },
            take: q.limit,
          }),
        ));
    return { items: rows };
  }

  /** Territory-level counts: open demand vs approved supply — Ops overview. */
  async overview() {
    return withGlobalScope(this.prisma.db, async (tx) => {
      const [openRequirements, approvedCandidates, openSuggestions] =
        await Promise.all([
          tx.requirement.groupBy({
            by: ['territoryId'],
            where: { status: 'OPEN' },
            _sum: { headcount: true },
          }),
          tx.candidate.groupBy({
            by: ['territoryId'],
            where: { status: 'APPROVED' },
            _count: true,
          }),
          tx.matchSuggestion.count({ where: { status: 'SUGGESTED' } }),
        ]);
      return { openRequirements, approvedCandidates, openSuggestions };
    });
  }

  private async recordMatchingDecision(
    actor: AuthUser,
    suggestion: MatchSuggestion,
    label: string,
  ) {
    await this.decisions.recordDecision({
      decisionType: 'MATCHING',
      subjectType: 'candidate',
      subjectId: suggestion.candidateId,
      actorRole: actor.roles[0],
      actorId: actor.userId,
      context: { requirementId: suggestion.requirementId },
      label,
      consentBasis: 'consent:v1',
    });
  }
}
