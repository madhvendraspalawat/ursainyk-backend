import { Injectable, NotFoundException } from '@nestjs/common';
import type { ScoreOverride, ScoringPresetPut } from '@ursainyk/contracts';
import { withGlobalScope } from '@ursainyk/db';
import { computeScore, type ScoringWeights } from '@ursainyk/engine-scoring';
import { AuditService } from '../audit/audit.service';
import { DecisionService } from '../audit/decision.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Ops surface for the scoring engine: preset weights (config, audited) and
 * manual overrides (SCORING_OVERRIDE DecisionEvents — calibration training).
 * The engine itself is pure (@ursainyk/engine-scoring, pinned tests).
 */
@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly decisions: DecisionService,
  ) {}

  async activePreset() {
    const preset = await this.prisma.db.scoringPreset.findFirst({
      where: { active: true },
    });
    if (!preset) throw new NotFoundException('no active scoring preset');
    return preset;
  }

  listPresets() {
    return this.prisma.db.scoringPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** New active preset; the old one stays for recomputability of old scores. */
  async putPreset(actor: AuthUser, input: ScoringPresetPut) {
    const created = await this.prisma.db.$transaction(async (tx) => {
      await tx.scoringPreset.updateMany({
        where: { active: true },
        data: { active: false },
      });
      return tx.scoringPreset.create({ data: { ...input, active: true } });
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'scoring.preset_update',
      entity: 'ScoringPreset',
      entityId: created.id,
      data: { name: input.name },
    });
    return created;
  }

  /** Compute + persist the score for a candidate with the active preset. */
  async scoreCandidate(candidateId: string): Promise<void> {
    const preset = await this.activePreset();
    await withGlobalScope(this.prisma.db, async (tx) => {
      const c = await tx.candidate.findUniqueOrThrow({
        where: { id: candidateId },
      });
      const { score, breakdown } = computeScore(
        c,
        preset.weights as unknown as ScoringWeights,
      );
      await tx.candidate.update({
        where: { id: candidateId },
        data: { score, scoreBreakdown: { presetId: preset.id, ...breakdown } },
      });
    });
  }

  /** Manual adjustment — calibration signal for the scoring model (ADR-0012). */
  async override(actor: AuthUser, candidateId: string, input: ScoreOverride) {
    const updated = await withGlobalScope(this.prisma.db, async (tx) => {
      const current = await tx.candidate.findUnique({
        where: { id: candidateId },
      });
      if (!current) throw new NotFoundException('candidate not found');
      const row = await tx.candidate.update({
        where: { id: candidateId },
        data: { score: input.score },
      });
      return { before: current.score, row };
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'scoring.override',
      entity: 'Candidate',
      entityId: candidateId,
      data: { score: input.score },
    });
    await this.decisions.recordDecision({
      decisionType: 'SCORING_OVERRIDE',
      subjectType: 'candidate',
      subjectId: candidateId,
      actorRole: 'OPS',
      actorId: actor.userId,
      input: { presetScore: updated.before },
      output: { overriddenScore: input.score },
      rationale: input.rationale,
      label: 'override',
      consentBasis: 'consent:v1',
    });
    return updated.row;
  }
}
