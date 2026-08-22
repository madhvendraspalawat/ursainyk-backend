import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/** BillingModule — manual-assisted runs over the pure engine; ledger projections (ADR-0005). */
@Module({
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
