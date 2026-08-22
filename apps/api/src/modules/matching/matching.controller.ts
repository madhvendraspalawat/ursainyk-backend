import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  SuggestionCreateSchema,
  SuggestionListQuerySchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { MatchingService } from './matching.service';

const IdSchema = z.string().uuid();

@Controller('matching')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('suggestions')
  @Require('match_suggestion:create')
  suggest(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { requirementId, candidateId } = SuggestionCreateSchema.parse(body);
    return this.matching.suggest(actor, requirementId, candidateId);
  }

  @Get('suggestions')
  @Require('match_suggestion:read')
  list(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.matching.list(actor, SuggestionListQuerySchema.parse(query));
  }

  @Post('suggestions/:id/accept')
  @Require('match_suggestion:update', 'placement:create')
  accept(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.matching.decide(actor, IdSchema.parse(id), 'accept');
  }

  @Post('suggestions/:id/dismiss')
  @Require('match_suggestion:update')
  dismiss(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.matching.decide(actor, IdSchema.parse(id), 'dismiss');
  }

  @Get('overview')
  @Require('match_suggestion:create') // Ops tool
  overview() {
    return this.matching.overview();
  }
}
