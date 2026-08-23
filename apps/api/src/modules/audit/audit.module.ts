import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AnomaliesService } from './anomalies.service';
import { AuditService } from './audit.service';
import { DecisionService } from './decision.service';

/**
 * AuditModule — append-only hash-chained audit log (ADR-0006, ADR-0012)
 * plus AI-training decision capture. Global: every module audits.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, DecisionService, AnomaliesService],
  exports: [AuditService, DecisionService],
})
export class AuditModule {}
