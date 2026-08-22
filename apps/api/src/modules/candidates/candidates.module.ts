import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

/**
 * CandidatesModule — intake + territory-scoped access (ADR-0007) and the
 * Reviewer gate (ADR-0008) with training capture (ADR-0012). See ./README.md.
 */
@Module({
  imports: [ScoringModule],
  controllers: [CandidatesController, ReviewController],
  providers: [CandidatesService, ReviewService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
