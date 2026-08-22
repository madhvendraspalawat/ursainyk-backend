import { Module } from '@nestjs/common';
import { CentresController } from './centres.controller';
import { CentresService } from './centres.service';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

/** AdminModule — ESM Manager (centres/territory assignment) + Sales BD (contractor orgs). */
@Module({
  controllers: [CentresController, OrgsController],
  providers: [CentresService, OrgsService],
})
export class AdminModule {}
