import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuditLogQuerySchema,
  DecisionExportQuerySchema,
  EraseSubjectSchema,
} from '@ursainyk/contracts';
import type { Prisma } from '@ursainyk/db';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { DecisionService } from './decision.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Audit display + training exports (ADR-0012). Two-tier visibility is enforced
 * here at the query layer: non-Super-Admin admins never see SUPER rows
 * (service/worker events, masked-read signals).
 */
@Controller('audit')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: DecisionService,
  ) {}

  @Get('logs')
  @Require('audit_log:read')
  async logs(@Query() query: unknown, @CurrentUser() user: AuthUser) {
    const q = AuditLogQuerySchema.parse(query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entity && { entity: q.entity }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.action && { action: { startsWith: q.action } }),
      ...((q.from || q.to) && {
        at: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) },
      }),
      ...(q.cursor && { id: { lt: q.cursor } }),
      // Two-tier rule: only SUPER_ADMIN sees SUPER rows.
      ...(user.roles.includes('SUPER_ADMIN')
        ? {}
        : { visibility: 'ADMIN' as const }),
    };
    const rows = await this.prisma.db.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: q.limit,
    });
    return {
      items: rows.map((r) => ({
        ...r,
        id: r.id.toString(),
        auditChain: undefined,
      })),
      nextCursor:
        rows.length === q.limit ? rows[rows.length - 1].id.toString() : null,
    };
  }

  /** Walks the hash chain; intact ⇒ { intact: true }. */
  @Get('chain/verify')
  @Require('training_data:configure')
  async chainVerify() {
    const [row] = await this.prisma.db.$queryRaw<
      { broken: bigint | null }[]
    >`SELECT audit_chain_verify() AS broken`;
    return {
      intact: row.broken === null,
      firstBrokenId: row.broken?.toString() ?? null,
    };
  }

  /** Pseudonymized JSONL for training. Excludes actorId and erased rows. */
  @Get('decisions/export')
  @Require('training_data:read')
  @Header('content-type', 'application/x-ndjson')
  async export(@Query() query: unknown): Promise<string> {
    const q = DecisionExportQuerySchema.parse(query);
    const rows = await this.prisma.db.decisionEvent.findMany({
      where: {
        decisionType: q.type,
        erasedAt: null,
        ...(q.consentBasis && { consentBasis: q.consentBasis }),
        ...(q.cursor && { id: { gt: q.cursor } }),
      },
      orderBy: { id: 'asc' },
      take: q.limit,
    });
    return rows
      .map((r) => {
        const { actorId, auditLogId, ...row } = r;
        void actorId; // internal only — excluded from every export
        return JSON.stringify({
          ...row,
          auditLogId: auditLogId?.toString() ?? null,
        });
      })
      .join('\n');
  }

  /** DPDP erasure of a subject's training payloads. Chain untouched. */
  @Post('decisions/erase')
  @HttpCode(200)
  @Require('training_data:configure')
  async erase(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { subjectType, subjectId } = EraseSubjectSchema.parse(body);
    const erasedEvents = await this.decisions.eraseSubject(
      subjectType,
      subjectId,
      user.userId,
    );
    return { erasedEvents };
  }
}
