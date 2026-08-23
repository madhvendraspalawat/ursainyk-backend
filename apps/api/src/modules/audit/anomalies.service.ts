import { Injectable } from '@nestjs/common';
import { withGlobalScope } from '@ursainyk/db';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../identity/auth-user';

const SPIKE_FACTOR = 3;
const MASK_READS_PER_DAY_THRESHOLD = 20;

/**
 * ADR-0006 R1 anomaly views: the business controls are only as good as the
 * queries watching them.
 *  - verificationSpikes: centres whose recent verification volume is far above
 *    their own baseline, or that report suspiciously zero attrition — the
 *    payout-inflation signal (Quiz 04).
 *  - maskReadPatterns: who is reading masked employer identities and how often —
 *    the disintermediation signal. SUPER-tier data → Super Admin callers only.
 */
@Injectable()
export class AnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthUser, days: number) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const [verificationSpikes, maskReadPatterns] = await Promise.all([
      this.verificationSpikes(since),
      actor.roles.includes('SUPER_ADMIN')
        ? this.maskReadPatterns(since)
        : Promise.resolve(undefined),
    ]);
    return {
      windowDays: days,
      verificationSpikes,
      ...(maskReadPatterns && { maskReadPatterns }),
    };
  }

  private async verificationSpikes(since: Date) {
    return withGlobalScope(this.prisma.db, async (tx) => {
      const recent = await tx.verification.groupBy({
        by: ['placementId'],
        where: { createdAt: { gte: since } },
        _count: true,
      });
      const placements = await tx.placement.findMany({
        where: { id: { in: recent.map((r) => r.placementId) } },
        select: { id: true, centreId: true },
      });
      const centreOf = new Map(placements.map((p) => [p.id, p.centreId]));

      const byCentre = new Map<string, { recent: number }>();
      for (const r of recent) {
        const centreId = centreOf.get(r.placementId);
        if (!centreId) continue;
        const entry = byCentre.get(centreId) ?? { recent: 0 };
        entry.recent += r._count;
        byCentre.set(centreId, entry);
      }

      const results: object[] = [];
      for (const [centreId, { recent: recentCount }] of byCentre) {
        const [total, leftEver] = await Promise.all([
          tx.verification.count({ where: { placement: { centreId } } }),
          tx.verification.count({
            where: { placement: { centreId }, outcome: 'LEFT' },
          }),
        ]);
        const baseline = Math.max(1, total - recentCount);
        const flags: string[] = [];
        if (recentCount > SPIKE_FACTOR * baseline) flags.push('volume_spike');
        if (total >= 4 && leftEver === 0) flags.push('zero_attrition'); // nobody ever leaves? (payout inflation)
        if (flags.length)
          results.push({ centreId, recentCount, baseline, leftEver, flags });
      }
      return results;
    });
  }

  private async maskReadPatterns(since: Date) {
    const rows = await this.prisma.db.$queryRaw<
      { actorId: string | null; day: Date; reads: bigint }[]
    >`SELECT "actorId", date_trunc('day', at) AS day, count(*) AS reads
      FROM "AuditLog"
      WHERE action = 'masked_employer.read' AND at >= ${since}
      GROUP BY "actorId", day
      ORDER BY reads DESC
      LIMIT 100`;
    return rows.map((r) => ({
      actorId: r.actorId,
      day: r.day,
      reads: Number(r.reads),
      flagged: Number(r.reads) > MASK_READS_PER_DAY_THRESHOLD,
    }));
  }
}
