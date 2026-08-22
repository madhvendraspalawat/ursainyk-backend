import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CandidateListQuerySchema,
  CandidateSelfUpdateSchema,
  WalkInCandidateSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { CandidatesService } from './candidates.service';

const IdSchema = z.string().uuid();

/**
 * Candidate intake API. Matrix gates each route (candidate holds
 * candidate_profile CRU at 'own'; ESM at 'territory'; Reviewer/Ops/Super at
 * 'all'); CandidatesService enforces the scope itself (ADR-0007).
 */
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  // Self-service (mobile app) — /candidates/me before /:id so 'me' never matches the param route.
  @Get('me')
  @Require('candidate_profile:read')
  me(@CurrentUser() user: AuthUser) {
    return this.candidates.getSelf(user);
  }

  @Patch('me')
  @Require('candidate_profile:update')
  updateMe(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.candidates.updateSelf(
      user,
      CandidateSelfUpdateSchema.parse(body),
    );
  }

  @Post('me/submit')
  @Require('candidate_profile:update')
  submitMe(@CurrentUser() user: AuthUser) {
    return this.candidates.submitSelf(user);
  }

  // ESM walk-in intake
  @Post()
  @Require('candidate_profile:create')
  walkIn(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.candidates.walkIn(actor, WalkInCandidateSchema.parse(body));
  }

  // Listing / detail (ESM territory, admin all)
  @Get()
  @Require('candidate_profile:read')
  list(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.candidates.list(actor, CandidateListQuerySchema.parse(query));
  }

  @Get(':id')
  @Require('candidate_profile:read')
  byId(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.candidates.getById(actor, IdSchema.parse(id));
  }
}
