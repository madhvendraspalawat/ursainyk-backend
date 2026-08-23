import { Injectable } from '@nestjs/common';
import { withGlobalScope } from '@ursainyk/db';
import { PrismaService } from '../../prisma/prisma.service';

/** Basic R1 dashboards: territory rollups over live tables. Money as paise strings. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(period: string) {
    return withGlobalScope(this.prisma.db, async (tx) => {
      const [
        candidatesByStatus,
        placementsByStage,
        openRequirements,
        verificationsThisPeriod,
        joinedHeads,
        ledger,
      ] = await Promise.all([
        tx.candidate.groupBy({ by: ['territoryId', 'status'], _count: true }),
        tx.placement.groupBy({ by: ['territoryId', 'stage'], _count: true }),
        tx.requirement.groupBy({
          by: ['territoryId'],
          where: { status: 'OPEN' },
          _sum: { headcount: true },
          _count: true,
        }),
        tx.verification.groupBy({
          by: ['outcome'],
          where: { period },
          _count: true,
        }),
        tx.placement.count({ where: { stage: 'JOINED' } }),
        tx.ledgerEntry.groupBy({
          by: ['kind'],
          where: { period },
          _sum: { amountPaise: true },
        }),
      ]);
      return {
        period,
        candidatesByStatus,
        placementsByStage,
        openRequirements,
        verification: {
          joinedHeads,
          thisPeriod: verificationsThisPeriod,
        },
        money: Object.fromEntries(
          ledger.map((l) => [l.kind, (l._sum.amountPaise ?? 0n).toString()]),
        ),
      };
    });
  }
}
