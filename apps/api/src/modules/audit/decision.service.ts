import { Injectable } from '@nestjs/common';
import { Prisma, type DecisionType } from '@ursainyk/db';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

export interface DecisionInput {
  decisionType: DecisionType;
  /** e.g. 'candidate', 'placement'. */
  subjectType: string;
  /** Raw internal id — pseudonymized before storage, never persisted on the event. */
  subjectId: string;
  actorRole?: string;
  actorId?: string;
  /** Verbose features (location, language, salary band…). PII-tokenized by the caller. */
  context?: Prisma.InputJsonValue;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  label?: string;
  rationale?: string;
  /** Consent basis under which this row may be used for training. */
  consentBasis: string;
}

/**
 * AI-training decision capture (ADR-0012). Payloads are erasable and
 * pseudonymized; the tamper-evident fact that the decision happened is a
 * chained AuditLog row referencing only the pseudonym.
 */
@Injectable()
export class DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recordDecision(d: DecisionInput): Promise<string> {
    const { subjectId, ...rest } = d;
    const pseudonym = await this.prisma.db.subjectPseudonym.upsert({
      where: {
        subjectType_subjectId: { subjectType: d.subjectType, subjectId },
      },
      update: {},
      create: { subjectType: d.subjectType, subjectId },
    });
    const auditLogId = await this.audit.record({
      actorType: d.actorId ? 'user' : 'service',
      actorId: d.actorId,
      action: `decision.${d.decisionType.toLowerCase()}`,
      entity: d.subjectType,
      entityId: pseudonym.key, // pseudonym, never the raw id — the chain is PII-free
      data: { decisionType: d.decisionType },
    });
    const event = await this.prisma.db.decisionEvent.create({
      data: { ...rest, subjectKey: pseudonym.key, auditLogId },
    });
    return event.id;
  }

  /**
   * DPDP erasure: null the payloads, tombstone the events, delete the
   * pseudonym mapping. The audit chain is untouched — it never held PII.
   */
  async eraseSubject(
    subjectType: string,
    subjectId: string,
    requestedBy: string,
  ): Promise<number> {
    const pseudonym = await this.prisma.db.subjectPseudonym.findUnique({
      where: { subjectType_subjectId: { subjectType, subjectId } },
    });
    if (!pseudonym) return 0;

    const { count } = await this.prisma.db.decisionEvent.updateMany({
      where: { subjectType, subjectKey: pseudonym.key, erasedAt: null },
      data: {
        context: Prisma.DbNull,
        input: Prisma.DbNull,
        output: Prisma.DbNull,
        rationale: null,
        erasedAt: new Date(),
      },
    });
    await this.prisma.db.subjectPseudonym.delete({
      where: { subjectType_subjectId: { subjectType, subjectId } },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: requestedBy,
      action: 'decision.erase',
      entity: subjectType,
      entityId: pseudonym.key,
      data: { erasedEvents: count },
    });
    return count;
  }
}
