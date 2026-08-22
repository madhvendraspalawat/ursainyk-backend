import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReviewApprove, ReviewQueueQuery } from '@ursainyk/contracts';
import { withGlobalScope, type Candidate } from '@ursainyk/db';
import { AuditService } from '../audit/audit.service';
import { DecisionService } from '../audit/decision.service';
import { OutboxService } from '../notifications/outbox.service';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/** Consent basis stamped on training rows until the consent workstream versions it. */
const CONSENT_BASIS = 'consent:v1';

/**
 * The Reviewer gate (ADR-0008): nothing enters the candidate pool unreviewed.
 * Every verdict is captured as a REVIEWER_CORRECTION DecisionEvent — the
 * before/after diff is the in-house parser's future training set (ADR-0012).
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly decisions: DecisionService,
    private readonly outbox: OutboxService,
    private readonly scoring: ScoringService,
  ) {}

  /** Oldest-first queue of PENDING_REVIEW candidates, platform-wide. */
  async queue(q: ReviewQueueQuery) {
    const rows = await withGlobalScope(this.prisma.db, (tx) =>
      tx.candidate.findMany({
        where: {
          status: 'PENDING_REVIEW',
          ...(q.cursor && { id: { gt: q.cursor } }),
        },
        orderBy: { id: 'asc' },
        take: q.limit,
      }),
    );
    return {
      items: rows,
      nextCursor: rows.length === q.limit ? rows[rows.length - 1].id : null,
    };
  }

  async approve(
    actor: AuthUser,
    candidateId: string,
    input: ReviewApprove,
  ): Promise<Candidate> {
    return this.decide(
      actor,
      candidateId,
      'APPROVED',
      input.corrections,
      input.rationale,
    );
  }

  async reject(
    actor: AuthUser,
    candidateId: string,
    rationale: string,
  ): Promise<Candidate> {
    return this.decide(actor, candidateId, 'REJECTED', undefined, rationale);
  }

  private async decide(
    actor: AuthUser,
    candidateId: string,
    verdict: 'APPROVED' | 'REJECTED',
    corrections?: ReviewApprove['corrections'],
    rationale?: string,
  ): Promise<Candidate> {
    const { before, after } = await withGlobalScope(
      this.prisma.db,
      async (tx) => {
        const current = await tx.candidate.findUnique({
          where: { id: candidateId },
        });
        if (!current) throw new NotFoundException('candidate not found');
        if (current.status !== 'PENDING_REVIEW')
          throw new BadRequestException(
            `cannot decide from status ${current.status}`,
          );
        const updated = await tx.candidate.update({
          where: { id: candidateId },
          data: { ...(corrections ?? {}), status: verdict },
        });
        await this.outbox.emit(
          verdict === 'APPROVED' ? 'candidate.approved' : 'candidate.rejected',
          { candidateId },
          tx,
        );
        return { before: current, after: updated };
      },
    );

    if (verdict === 'APPROVED') {
      // CIBIL-like score computed at the gate with the active preset (pure engine).
      await this.scoring.scoreCandidate(candidateId);
    }
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: verdict === 'APPROVED' ? 'candidate.approve' : 'candidate.reject',
      entity: 'Candidate',
      entityId: candidateId,
    });
    // Training capture (ADR-0012): pseudonymized, PII-light snapshots.
    await this.decisions.recordDecision({
      decisionType: 'REVIEWER_CORRECTION',
      subjectType: 'candidate',
      subjectId: candidateId,
      actorRole: 'REVIEWER',
      actorId: actor.userId,
      input: this.snapshot(before),
      output: this.snapshot(after),
      label: verdict.toLowerCase(),
      rationale,
      context: {
        territoryId: before.territoryId,
        source: before.createdById ? 'walk_in' : 'self',
        city: before.city,
      },
      consentBasis: CONSENT_BASIS,
    });
    if (verdict === 'APPROVED') {
      // Score was computed after the snapshot — return the fresh row.
      return withGlobalScope(this.prisma.db, (tx) =>
        tx.candidate.findUniqueOrThrow({ where: { id: candidateId } }),
      );
    }
    return after;
  }

  /** Profile fields only — never name/phone (direct identifiers stay out of training rows). */
  private snapshot(c: Candidate) {
    return {
      languages: c.languages,
      qualification: c.qualification,
      educationLevel: c.educationLevel,
      totalExpMonths: c.totalExpMonths,
      relevantExpMonths: c.relevantExpMonths,
      city: c.city,
      locationFlexible: c.locationFlexible,
    };
  }
}
