import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  VerificationCreateSchema,
  VerificationDueQuerySchema,
} from '@ursainyk/contracts';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { VerificationService } from './verification.service';

@Controller('verifications')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post()
  @Require('verification:create')
  submit(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.verification.submit(
      actor,
      VerificationCreateSchema.parse(body),
    );
  }

  @Get('due')
  @Require('verification:create')
  due(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    const { period } = VerificationDueQuerySchema.parse(query);
    return this.verification.due(actor, period);
  }
}
