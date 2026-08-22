import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BillingRun, LedgerQuery } from '@ursainyk/contracts';
import { withGlobalScope, type Prisma } from '@ursainyk/db';
import {
  computeBillingRun,
  type BillingRates,
  type VerificationFact,
} from '@ursainyk/engine-billing';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../notifications/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Manual-assisted billing runs (R1): a Finance human triggers, the pure
 * engine computes, the ledger records append-only lines (ADR-0005).
 * Idempotency: same idempotencyKey → the same line keys → createMany
 * skipDuplicates writes nothing twice. Invoices/payouts are GROUP BY
 * projections over the ledger — never stored, never edited.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async run(actor: AuthUser, input: BillingRun) {
    const rates = await this.rates();
    const facts = await this.factsForPeriod(input.period);
    if (facts.length === 0)
      throw new ConflictException('no verification facts for period');

    const result = computeBillingRun(facts, rates);
    const runId = randomUUID();
    const rows: Prisma.LedgerEntryCreateManyInput[] = [
      ...result.invoiceLines.map((l): Prisma.LedgerEntryCreateManyInput => ({
        runId,
        period: input.period,
        kind: 'INVOICE_LINE',
        amountPaise: l.amountPaise,
        orgId: l.orgId,
        placementId: l.placementId,
        idempotencyKey: `${input.idempotencyKey}:${l.placementId}:INVOICE_LINE`,
      })),
      ...result.payoutLines.map((l): Prisma.LedgerEntryCreateManyInput => ({
        runId,
        period: input.period,
        kind: 'PAYOUT_LINE',
        amountPaise: l.amountPaise,
        centreId: l.centreId,
        placementId: l.placementId,
        idempotencyKey: `${input.idempotencyKey}:${l.placementId}:PAYOUT_LINE`,
      })),
    ];
    const { count } = await this.prisma.db.ledgerEntry.createMany({
      data: rows,
      skipDuplicates: true, // rerun with same key → 0 new rows
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'billing.run',
      entity: 'LedgerEntry',
      entityId: runId,
      data: {
        period: input.period,
        lines: count,
        skipped: rows.length - count,
      },
    });
    if (count > 0)
      await this.outbox.emit('billing.run_completed', {
        runId,
        period: input.period,
      });
    return {
      runId,
      period: input.period,
      linesWritten: count,
      linesSkipped: rows.length - count,
      totals: {
        invoicedPaise: result.totals.invoicedPaise.toString(),
        payoutPaise: result.totals.payoutPaise.toString(),
      },
    };
  }

  /** Invoice projection, grouped per org. Contractor sees own org only. */
  async invoices(actor: AuthUser, q: LedgerQuery) {
    const orgFilter =
      scopeOf(actor.roles, 'invoice', 'read') === 'org'
        ? { orgId: { in: actor.orgIds } }
        : q.orgId
          ? { orgId: q.orgId }
          : {};
    const groups = await this.prisma.db.ledgerEntry.groupBy({
      by: ['orgId', 'period'],
      where: {
        kind: 'INVOICE_LINE',
        ...(q.period && { period: q.period }),
        ...orgFilter,
      },
      _sum: { amountPaise: true },
      _count: true,
    });
    return groups.map((g) => ({
      orgId: g.orgId,
      period: g.period,
      totalPaise: (g._sum.amountPaise ?? 0n).toString(),
      lines: g._count,
    }));
  }

  /** Payout projection, grouped per centre. ESM sees own centres only. */
  async payouts(actor: AuthUser, q: LedgerQuery) {
    let centreFilter: object = q.centreId ? { centreId: q.centreId } : {};
    if (scopeOf(actor.roles, 'payout', 'read') === 'own') {
      const memberships = await this.prisma.db.centreMembership.findMany({
        where: { userId: actor.userId },
        select: { centreId: true },
      });
      centreFilter = { centreId: { in: memberships.map((m) => m.centreId) } };
    }
    const groups = await this.prisma.db.ledgerEntry.groupBy({
      by: ['centreId', 'period'],
      where: {
        kind: 'PAYOUT_LINE',
        ...(q.period && { period: q.period }),
        ...centreFilter,
      },
      _sum: { amountPaise: true },
      _count: true,
    });
    return groups.map((g) => ({
      centreId: g.centreId,
      period: g.period,
      totalPaise: (g._sum.amountPaise ?? 0n).toString(),
      lines: g._count,
    }));
  }

  private async rates(): Promise<BillingRates> {
    const cfg = await this.prisma.db.systemConfig.findUnique({
      where: { key: 'billing.rates' },
    });
    if (!cfg) throw new NotFoundException('billing.rates config missing');
    const value = cfg.value as {
      pricePerActiveHeadPaise: number;
      esmShareBp: number;
    };
    return {
      pricePerActiveHeadPaise: BigInt(value.pricePerActiveHeadPaise),
      esmShareBp: BigInt(value.esmShareBp),
    };
  }

  private async factsForPeriod(period: string): Promise<VerificationFact[]> {
    const rows = await withGlobalScope(this.prisma.db, (tx) =>
      tx.verification.findMany({
        where: { period },
        include: { placement: { include: { requirement: true } } },
      }),
    );
    return rows.map((v) => ({
      placementId: v.placementId,
      orgId: v.placement.requirement.orgId,
      centreId: v.placement.centreId,
      outcome: v.outcome,
    }));
  }
}
