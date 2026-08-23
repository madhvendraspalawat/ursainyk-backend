import { Body, Controller, HttpCode, Post, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  PasswordLoginSchema,
  PasswordChangeSchema,
  PasswordSetSchema,
  RefreshSchema,
  TotpActivateSchema,
} from '@ursainyk/contracts';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser, type AuthUser } from './auth-user';

/**
 * Auth endpoints (ADR-0004). zod parses every body (CONTRIBUTING) —
 * ZodError → 400 via the app-level exception filter (Nest default 500 until
 * the error-handling workstream; acceptable for scaffold, TODO).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const { email, password, totp } = PasswordLoginSchema.parse(body);
    return this.auth.passwordLogin(email, password, totp);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('otp/request')
  @HttpCode(202)
  async otpRequest(@Body() body: unknown) {
    const { phone } = OtpRequestSchema.parse(body);
    await this.auth.otpRequest(phone);
    return { status: 'sent' }; // same response whether or not the phone exists
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('otp/verify')
  @HttpCode(200)
  otpVerify(@Body() body: unknown) {
    const { phone, code } = OtpVerifySchema.parse(body);
    return this.auth.otpVerify(phone, code);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const { refreshToken } = RefreshSchema.parse(body);
    return this.auth.refresh(refreshToken);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password/set')
  @HttpCode(204)
  async passwordSet(@Body() body: unknown) {
    const { token, newPassword } = PasswordSetSchema.parse(body);
    await this.auth.passwordSet(token, newPassword);
  }

  @Post('password/change')
  @HttpCode(204)
  async passwordChange(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { currentPassword, newPassword } = PasswordChangeSchema.parse(body);
    await this.auth.passwordChange(user.userId, currentPassword, newPassword);
  }

  @Post('totp/enroll')
  @HttpCode(200)
  totpEnroll(@CurrentUser() user: AuthUser) {
    return this.auth.totpEnroll(user.userId);
  }

  @Post('totp/activate')
  @HttpCode(204)
  async totpActivate(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { code } = TotpActivateSchema.parse(body);
    await this.auth.totpActivate(user.userId, code);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.userId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
