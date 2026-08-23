import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VerificationCreate } from '@ursainyk/contracts';
import { withTerritoryScope, type Verification } from '@ursainyk/db';
import { AuditService } from '../audit/audit.service';
import { DecisionService } from '../audit/decision.service';
import { OutboxService } from '../notifications/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Monthly active-verification (the business heartbeat): immutable facts
 * (ADR-0005 — DB trigger blocks UPDATE/DELETE; corrections are new periods,
 * not edits) that drive contractor invoices AND ESM payouts. Every outcome is
 * also a VERIFICATION_OUTCOME DecisionEvent (churn-prediction training).
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly decisions: DecisionService,
    private readonly outbox: OutboxService,
  ) {}

  async submit(
    actor: AuthUser,
    input: VerificationCreate,
  ): Promise<Verification> {
    const created = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      async (tx) => {
        const placement = await tx.placement.findFirst({
          where: {
            id: input.placementId,
            territoryId: { in: actor.territoryIds },
          },
        });
        if (!placement) throw new NotFoundException('placement not found');
        if (placement.stage !== 'PLACED' && placement.stage !== 'JOINED')
          throw new BadRequestException(
            'only PLACED/JOINED placements are verifiable',
          );
        try {
          const row = await tx.verification.create({
            data: { ...input, submittedById: actor.userId },
          });
          await this.outbox.emit(
            'verification.completed',
            {
              placementId: input.placementId,
              period: input.period,
              outcome: input.outcome,
            },
            tx,
          );
          return row;
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002')
            throw new ConflictException(
              'verification already recorded for this period',
            ); // immutable fact
          throw e;
        }
      },
    );
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'verification.submit',
      entity: 'Placement',
      entityId: input.placementId,
      data: { period: input.period, outcome: input.outcome },
    });
    await this.decisions.recordDecision({
      decisionType: 'VERIFICATION_OUTCOME',
      subjectType: 'placement',
      subjectId: input.placementId,
      actorRole: 'ESM_CENTRE',
      actorId: actor.userId,
      output: { period: input.period, outcome: input.outcome },
      label: input.outcome.toLowerCase(),
      consentBasis: 'consent:v1',
    });
    return created;
  }

  /** Retention list ("these N left — call them"): LEFT in `period`, not since won back. */
  async winback(actor: AuthUser, period: string) {
    const rows = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      (tx) =>
        tx.verification.findMany({
          where: {
            period,
            outcome: 'LEFT',
            placement: {
              territoryId: { in: actor.territoryIds },
              verifications: {
                none: { outcome: 'WON_BACK', period: { gt: period } },
              },
            },
          },
          include: {
            placement: {
              include: {
                candidate: { select: { id: true, name: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 200,
        }),
    );
    return {
      period,
      items: rows.map((v) => ({
        placementId: v.placementId,
        candidate: v.placement.candidate,
        leftInPeriod: v.period,
      })),
    };
  }

  /** Work-list: JOINED placements in the caller's territories missing this period's fact. */
  async due(actor: AuthUser, period: string) {
    const rows = await withTerritoryScope(
      this.prisma.db,
      actor.territoryIds,
      (tx) =>
        tx.placement.findMany({
          where: {
            territoryId: { in: actor.territoryIds },
            stage: 'JOINED',
            verifications: { none: { period } },
          },
          orderBy: { id: 'asc' },
          take: 200,
        }),
    );
    return { period, items: rows };
  }
}
