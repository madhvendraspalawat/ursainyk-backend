import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenPair } from '@ursainyk/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './jwt.strategy';
import type { AuthUser, JwtPayload } from './auth-user';

const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * JWT access + rotating refresh with server-side revocation (ADR-0004).
 * Refresh reuse (a revoked token presented again) revokes the whole family —
 * the classic stolen-token tell — and is audit-logged.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async issuePair(
    user: AuthUser,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.userId,
      kind: user.kind,
      roles: user.roles,
      tid: user.territoryIds,
      oid: user.orgIds,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.db.refreshToken.create({
      data: {
        userId: user.userId,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Rotate: revoke the presented token, issue a new one in the same family. */
  async rotate(
    refreshToken: string,
    loadUser: (userId: string) => Promise<AuthUser>,
  ): Promise<TokenPair> {
    const row = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!row) throw new UnauthorizedException('unknown refresh token');

    if (row.revokedAt) {
      // Reuse of a rotated-out token: assume theft, kill the family (ADR-0004).
      await this.prisma.db.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        actorType: 'user',
        actorId: row.userId,
        action: 'auth.refresh_reuse',
        entity: 'RefreshToken',
        entityId: row.id,
        data: { familyId: row.familyId },
      });
      throw new UnauthorizedException('refresh token reuse detected');
    }
    if (row.expiresAt < new Date())
      throw new UnauthorizedException('refresh token expired');

    await this.prisma.db.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const user = await loadUser(row.userId);
    return this.issuePair(user, row.familyId);
  }

  /** Server-side logout: revoke all live refresh tokens for the user. */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
