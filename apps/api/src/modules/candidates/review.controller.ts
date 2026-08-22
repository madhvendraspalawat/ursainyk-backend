import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ReviewApproveSchema,
  ReviewQueueQuerySchema,
  ReviewRejectSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { ReviewService } from './review.service';

const IdSchema = z.string().uuid();

/**
 * Reviewer gate. candidate_profile:approve belongs to REVIEWER alone
 * (pinned in @ursainyk/rbac) — the queue and both verdicts sit behind it.
 */
@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('queue')
  @Require('candidate_profile:approve')
  queue(@Query() query: unknown) {
    return this.review.queue(ReviewQueueQuerySchema.parse(query));
  }

  @Post(':id/approve')
  @Require('candidate_profile:approve')
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.review.approve(
      actor,
      IdSchema.parse(id),
      ReviewApproveSchema.parse(body ?? {}),
    );
  }

  @Post(':id/reject')
  @Require('candidate_profile:approve')
  reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const { rationale } = ReviewRejectSchema.parse(body);
    return this.review.reject(actor, IdSchema.parse(id), rationale);
  }
}
