import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CentreCreateSchema, CentrePatchSchema } from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { CentresService } from './centres.service';

const IdSchema = z.string().uuid();

/** ESM Manager: franchise onboarding, performance, centre↔territory assignment. */
@Controller('centres')
export class CentresController {
  constructor(private readonly centres: CentresService) {}

  @Post()
  @Require('esm_centre:create')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.centres.create(actor, CentreCreateSchema.parse(body));
  }

  @Get()
  @Require('esm_centre:read')
  list() {
    return this.centres.list();
  }

  @Patch(':id')
  @Require('esm_centre:update')
  patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.centres.setActive(
      actor,
      IdSchema.parse(id),
      CentrePatchSchema.parse(body).active,
    );
  }

  /** Territory assignment shapes the RLS perimeter (ADR-0007) — audited. */
  @Post(':id/territories/:territoryId')
  @HttpCode(204)
  @Require('territory:update')
  async assign(
    @Param('id') id: string,
    @Param('territoryId') territoryId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.centres.assignTerritory(
      actor,
      IdSchema.parse(id),
      IdSchema.parse(territoryId),
    );
  }

  @Delete(':id/territories/:territoryId')
  @HttpCode(204)
  @Require('territory:update')
  async unassign(
    @Param('id') id: string,
    @Param('territoryId') territoryId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.centres.unassignTerritory(
      actor,
      IdSchema.parse(id),
      IdSchema.parse(territoryId),
    );
  }

  @Get(':id/summary')
  @Require('esm_centre:read')
  summary(@Param('id') id: string) {
    return this.centres.summary(IdSchema.parse(id));
  }
}
