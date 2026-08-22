import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevConsoleOtpSender, OtpSender } from './otp.sender';
import { Msg91OtpSender, otpSenderFactory } from './msg91-otp.sender';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JwtStrategy,
  jwtAccessSecret,
} from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { TokenService } from './token.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * IdentityModule — in-house auth (ADR-0004) + RBAC enforcement (@ursainyk/rbac).
 * PermissionsGuard is global: any route annotated @Require(...) is checked;
 * routes without the annotation pass through (auth itself, health).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: jwtAccessSecret(),
      signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    TokenService,
    UsersService,
    JwtStrategy,
    DevConsoleOtpSender,
    Msg91OtpSender,
    {
      provide: OtpSender,
      useFactory: otpSenderFactory, // MSG91 when configured, dev console otherwise
      inject: [DevConsoleOtpSender, Msg91OtpSender],
    },
    // Order matters: authenticate first, then authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class IdentityModule {}
