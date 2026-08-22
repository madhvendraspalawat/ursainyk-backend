import { Injectable } from '@nestjs/common';
import type { AuditVisibility, Prisma } from '@ursainyk/db';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEvent {
  actorType: 'user' | 'service';
  actorId?: string;
  /** Dotted verb: 'auth.login', 'role.grant', 'masked_employer.read'. */
  action: string;
  entity: string;
  entityId?: string;
  data?: Prisma.InputJsonValue;
  /**
   * Two-tier display (ADR-0012). Defaults: service actors → SUPER,
   * humans → ADMIN. Masked-read actions are always SUPER — they are the
   * bypass-detection signal, not operational noise.
   */
  visibility?: AuditVisibility;
}

/**
 * Append-only, hash-chained audit log (ADR-0006, ADR-0012). The DB owns the
 * chain (BEFORE INSERT trigger) and immutability (block-mutation trigger);
 * this service only ever inserts. No PII in `data` (CONTRIBUTING) — decision
 * payloads belong in DecisionEvent.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<bigint> {
    const { visibility, ...rest } = event;
    const row = await this.prisma.db.auditLog.create({
      data: {
        ...rest,
        visibility: visibility ?? this.defaultVisibility(event),
      },
    });
    return row.id;
  }

  private defaultVisibility(event: AuditEvent): AuditVisibility {
    if (event.action.startsWith('masked_')) return 'SUPER';
    return event.actorType === 'service' ? 'SUPER' : 'ADMIN';
  }
}
