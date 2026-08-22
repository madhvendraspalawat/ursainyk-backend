import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'public_route';

/** Opt a route out of the global JwtAuthGuard (login, OTP, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
