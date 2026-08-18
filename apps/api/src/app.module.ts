import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from './modules/identity/identity.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ParserModule } from './modules/parser/parser.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { RequirementsModule } from './modules/requirements/requirements.module';
import { MatchingModule } from './modules/matching/matching.module';
import { PlacementsModule } from './modules/placements/placements.module';
import { VerificationModule } from './modules/verification/verification.module';
import { BillingModule } from './modules/billing/billing.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { AuditModule } from './modules/audit/audit.module';
import { ConfigModule } from './modules/config/config.module';
import { AdminModule } from './modules/admin/admin.module';

/**
 * Modular monolith (ADR-0002): one bounded-context module per folder under ./modules.
 * Modules are empty shells until their workstream starts.
 */
@Module({
  imports: [
    IdentityModule,
    CandidatesModule,
    DocumentsModule,
    ParserModule,
    ScoringModule,
    RequirementsModule,
    MatchingModule,
    PlacementsModule,
    VerificationModule,
    BillingModule,
    PayoutsModule,
    NotificationsModule,
    I18nModule,
    AuditModule,
    ConfigModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
