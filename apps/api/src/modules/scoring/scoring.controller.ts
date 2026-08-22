import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  ScoreOverrideSchema,
  ScoringPresetPutSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { ScoringService } from './scoring.service';

const IdSchema = z.string().uuid();

@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  @Get('presets')
  @Require('candidate_score:configure')
  presets() {
    return this.scoring.listPresets();
  }

  @Put('presets')
  @Require('candidate_score:configure')
  putPreset(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.scoring.putPreset(actor, ScoringPresetPutSchema.parse(body));
  }

  @Post('candidates/:id/override')
  @Require('candidate_score:configure')
  override(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.scoring.override(
      actor,
      IdSchema.parse(id),
      ScoreOverrideSchema.parse(body),
    );
  }
}
