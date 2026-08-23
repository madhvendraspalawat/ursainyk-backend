import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CentresController } from './centres.controller';
import { CentresService } from './centres.service';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

/** AdminModule — ESM Manager (centres/territory assignment) + Sales BD (contractor orgs). */
@Module({
  controllers: [AnalyticsController, CentresController, OrgsController],
  providers: [AnalyticsService, CentresService, OrgsService],
})
export class AdminModule {}
