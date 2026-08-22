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
  PlacementCreateSchema,
  PlacementListQuerySchema,
  PlacementStageSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { PlacementsService } from './placements.service';

const IdSchema = z.string().uuid();

@Controller('placements')
export class PlacementsController {
  constructor(private readonly placements: PlacementsService) {}

  @Post()
  @Require('placement:create')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    const { candidateId, requirementId } = PlacementCreateSchema.parse(body);
    return this.placements.create(actor, candidateId, requirementId);
  }

  @Patch(':id/stage')
  @Require('placement:update')
  setStage(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const { stage } = PlacementStageSchema.parse(body);
    return this.placements.setStage(actor, IdSchema.parse(id), stage);
  }

  @Get()
  @Require('placement:read')
  list(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.placements.list(actor, PlacementListQuerySchema.parse(query));
  }
}
