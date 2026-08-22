import { Module } from '@nestjs/common';
import { PlacementsModule } from '../placements/placements.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

/** MatchingModule — Phase-1 manual-assisted matching with MATCHING training capture. */
@Module({
  imports: [PlacementsModule],
  controllers: [MatchingController],
  providers: [MatchingService],
})
export class MatchingModule {}
