import { createHash, randomInt } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import type { TokenPair } from '@ursainyk/contracts';
import type { Role } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpSender } from './otp.sender';
import { TokenService } from './token.service';
import type { AuthUser } from './auth-user';

const ADMIN_ROLES: readonly Role[] = [
  'REVIEWER',
  'OPS',
  'FINANCE',
  'ESM_MANAGER',
  'SALES_BD',
  'SUPER_ADMIN',
];

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MS = 15 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface LoginResult extends TokenPair {
  /** ADR-0004: TOTP is mandatory for admin roles. True until the user enrolls. */
  mfaEnrollmentRequired?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otpSender: OtpSender,
    private readonly audit: AuditService,
  ) {}

  // ── Portal: email + password (+ TOTP for admin roles) ─────────────────────

  async passwordLogin(
    email: string,
    password: string,
    totp?: string,
  ): Promise<LoginResult> {
    const user = await this.prisma.db.user.findUnique({
      where: { email },
      include: {
        credential: true,
        roles: true,
        centreMemberships: {
          include: { centre: { include: { territories: true } } },
        },
        contractorMemberships: true,
      },
    });
    if (!user || user.status !== 'ACTIVE' || !user.credential?.passwordHash) {
      await this.auditLoginFailed(email, 'unknown_or_disabled');
      throw new UnauthorizedException('invalid credentials');
    }
    if (!(await argon2.verify(user.credential.passwordHash, password))) {
      await this.auditLoginFailed(user.id, 'bad_password');
      throw new UnauthorizedException('invalid credentials');
    }

    const roles = user.roles.map((r) => r.role);
    const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
    let mfaEnrollmentRequired = false;
    if (isAdmin) {
      if (user.credential.totpSecret && user.credential.totpVerifiedAt) {
        if (
          !totp ||
          !authenticator.verify({
            token: totp,
            secret: user.credential.totpSecret,
          })
        ) {
          await this.auditLoginFailed(user.id, 'bad_totp');
          throw new UnauthorizedException('TOTP required');
        }
      } else if (process.env.ADMIN_MFA_ENFORCE === '1') {
        // Production posture (ADR-0004: TOTP mandatory for admins): no admin
        // session without a verified authenticator. Enroll via /auth/totp/*.
        await this.auditLoginFailed(user.id, 'mfa_not_enrolled');
        throw new UnauthorizedException('TOTP enrollment required');
      } else {
        // Dev posture: let the session through, flag it so portals force enrollment.
        mfaEnrollmentRequired = true;
      }
    }

    const principal = this.toAuthUser(user.id, 'PORTAL', roles, user);
    await this.audit.record({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
    });
    const pair = await this.tokens.issuePair(principal);
    return mfaEnrollmentRequired ? { ...pair, mfaEnrollmentRequired } : pair;
  }

  // ── Candidate: phone OTP (ADR-0004) ───────────────────────────────────────

  async otpRequest(phone: string): Promise<void> {
    let user = await this.prisma.db.user.findUnique({
      where: { phone },
      include: { credential: true },
    });
    if (!user) {
      // Self-registration (OTP-first UX, ADR-0004): unknown phone becomes a
      // minimal candidate account; profile is completed by the candidates
      // module later. Response stays identical — anti-enumeration.
      user = await this.prisma.db.user.create({
        data: {
          kind: 'CANDIDATE',
          phone,
          name: '',
          credential: { create: {} },
          roles: { create: [{ role: 'CANDIDATE' }] },
        },
        include: { credential: true },
      });
      await this.audit.record({
        actorType: 'user',
        actorId: user.id,
        action: 'user.self_registered',
        entity: 'User',
        entityId: user.id,
      });
    }
    // Do not reveal whether the phone maps to a usable account — same response either way.
    if (user.kind !== 'CANDIDATE' || user.status !== 'ACTIVE') return;
    const cred = user.credential;
    if (cred?.otpLockedTil && cred.otpLockedTil > new Date()) return;
    // Resend cooldown: lastSentAt is derivable from the stored expiry.
    if (
      cred?.otpExpiresAt &&
      cred.otpExpiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_COOLDOWN_MS >
        Date.now()
    )
      return;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.db.credential.upsert({
      where: { userId: user.id },
      update: {
        otpHash: sha256(code),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        otpAttempts: 0,
        otpLockedTil: null,
      },
      create: {
        userId: user.id,
        otpHash: sha256(code),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.otp_request',
      entity: 'User',
      entityId: user.id,
    });
    await this.otpSender.send(phone, code);
  }

  async otpVerify(phone: string, code: string): Promise<TokenPair> {
    const user = await this.prisma.db.user.findUnique({
      where: { phone },
      include: { credential: true, roles: true },
    });
    const cred = user?.credential;
    if (!user || !cred?.otpHash || !cred.otpExpiresAt)
      throw new UnauthorizedException('invalid code');
    if (cred.otpLockedTil && cred.otpLockedTil > new Date())
      throw new UnauthorizedException('locked, retry later');
    if (cred.otpExpiresAt < new Date())
      throw new UnauthorizedException('code expired');

    if (cred.otpHash !== sha256(code)) {
      const attempts = cred.otpAttempts + 1;
      await this.prisma.db.credential.update({
        where: { userId: user.id },
        data:
          attempts >= OTP_MAX_ATTEMPTS
            ? {
                otpAttempts: 0,
                otpHash: null,
                otpExpiresAt: null,
                otpLockedTil: new Date(Date.now() + OTP_LOCK_MS),
              }
            : { otpAttempts: attempts },
      });
      await this.auditLoginFailed(user.id, 'bad_otp');
      throw new UnauthorizedException('invalid code');
    }

    await this.prisma.db.credential.update({
      where: { userId: user.id },
      data: {
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpLockedTil: null,
      },
    });
    const roles = user.roles.map((r) => r.role);
    await this.audit.record({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      data: { method: 'otp' },
    });
    return this.tokens.issuePair({
      userId: user.id,
      kind: 'CANDIDATE',
      roles,
      territoryIds: [],
      orgIds: [],
    });
  }

  /** Self-service password change. Revokes every session — full re-login. */
  async passwordChange(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const cred = await this.prisma.db.credential.findUnique({
      where: { userId },
    });
    if (
      !cred?.passwordHash ||
      !(await argon2.verify(cred.passwordHash, currentPassword))
    ) {
      await this.auditLoginFailed(userId, 'bad_password_change');
      throw new UnauthorizedException('invalid credentials');
    }
    await this.prisma.db.credential.update({
      where: { userId },
      data: {
        passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
      },
    });
    await this.tokens.revokeAll(userId);
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'auth.password_changed',
      entity: 'User',
      entityId: userId,
    });
  }

  // ── TOTP enrollment (ADR-0004: mandatory for admin roles) ─────────────────

  /** Start enrollment: store an unverified secret, return the otpauth URI to scan. */
  async totpEnroll(
    userId: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const secret = authenticator.generateSecret();
    await this.prisma.db.credential.upsert({
      where: { userId },
      update: { totpSecret: secret, totpVerifiedAt: null },
      create: { userId, totpSecret: secret },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'auth.totp_enroll_started',
      entity: 'User',
      entityId: userId,
    });
    return {
      secret,
      otpauthUri: authenticator.keyuri(
        user.email ?? user.phone ?? userId,
        'Ursainyk',
        secret,
      ),
    };
  }

  /** Finish enrollment: prove possession of the secret. Enforced at next login. */
  async totpActivate(userId: string, code: string): Promise<void> {
    const cred = await this.prisma.db.credential.findUnique({
      where: { userId },
    });
    if (!cred?.totpSecret)
      throw new UnauthorizedException('no enrollment in progress');
    if (!authenticator.verify({ token: code, secret: cred.totpSecret })) {
      await this.auditLoginFailed(userId, 'bad_totp_activation');
      throw new UnauthorizedException('invalid code');
    }
    await this.prisma.db.credential.update({
      where: { userId },
      data: { totpVerifiedAt: new Date() },
    });
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'auth.totp_enrolled',
      entity: 'User',
      entityId: userId,
    });
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, (userId) =>
      this.loadPrincipal(userId),
    );
  }

  async logout(userId: string): Promise<void> {
    await this.tokens.revokeAll(userId);
    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'auth.logout',
      entity: 'User',
      entityId: userId,
    });
  }

  async loadPrincipal(userId: string): Promise<AuthUser> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: true,
        centreMemberships: {
          include: { centre: { include: { territories: true } } },
        },
        contractorMemberships: true,
      },
    });
    if (user.status !== 'ACTIVE')
      throw new UnauthorizedException('user disabled');
    return this.toAuthUser(
      user.id,
      user.kind,
      user.roles.map((r) => r.role),
      user,
    );
  }

  private toAuthUser(
    userId: string,
    kind: AuthUser['kind'],
    roles: Role[],
    user: {
      centreMemberships?: {
        centre: { territories: { territoryId: string }[] };
      }[];
      contractorMemberships?: { orgId: string }[];
    },
  ): AuthUser {
    const territoryIds = [
      ...new Set(
        (user.centreMemberships ?? []).flatMap((m) =>
          m.centre.territories.map((t) => t.territoryId),
        ),
      ),
    ];
    const orgIds = (user.contractorMemberships ?? []).map((m) => m.orgId);
    return { userId, kind, roles, territoryIds, orgIds };
  }

  private async auditLoginFailed(
    actorId: string,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      actorType: 'user',
      actorId,
      action: 'auth.login_failed',
      entity: 'User',
      data: { reason },
    });
  }
}
