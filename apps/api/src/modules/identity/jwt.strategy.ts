import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, JwtPayload } from './auth-user';

export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function jwtAccessSecret(): string {
  return process.env.JWT_ACCESS_SECRET ?? 'change-me';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtAccessSecret(),
    });
  }

  /** Return value becomes request.user. */
  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      kind: payload.kind,
      roles: payload.roles,
      territoryIds: payload.tid ?? [],
      orgIds: payload.oid ?? [],
    };
  }
}
