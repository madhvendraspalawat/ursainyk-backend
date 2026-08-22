import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillingRunSchema, LedgerQuerySchema } from '@ursainyk/contracts';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { BillingService } from './billing.service';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('billing/runs')
  @Require('invoice:create')
  run(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.billing.run(actor, BillingRunSchema.parse(body));
  }

  @Get('billing/invoices')
  @Require('invoice:read')
  invoices(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.billing.invoices(actor, LedgerQuerySchema.parse(query));
  }

  @Get('payouts')
  @Require('payout:read')
  payouts(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.billing.payouts(actor, LedgerQuerySchema.parse(query));
  }
}
