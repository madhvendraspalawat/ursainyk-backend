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
  RequirementCreateSchema,
  RequirementListQuerySchema,
  RequirementUpdateSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { RequirementsService } from './requirements.service';

const IdSchema = z.string().uuid();

@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Post()
  @Require('requirement:create')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.requirements.create(actor, RequirementCreateSchema.parse(body));
  }

  @Get()
  @Require('requirement:read')
  list(@Query() query: unknown, @CurrentUser() actor: AuthUser) {
    return this.requirements.list(
      actor,
      RequirementListQuerySchema.parse(query),
    );
  }

  @Get(':id')
  @Require('requirement:read')
  byId(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.requirements.getById(actor, IdSchema.parse(id));
  }

  @Patch(':id')
  @Require('requirement:update')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.requirements.update(
      actor,
      IdSchema.parse(id),
      RequirementUpdateSchema.parse(body),
    );
  }

  /** Unmask — audited masked_employer.read (ADR-0006). Contractor: own only; Super Admin: any. */
  @Get(':id/employer')
  @Require('employer_identity:read')
  employer(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.requirements.unmaskEmployer(actor, IdSchema.parse(id));
  }
}
