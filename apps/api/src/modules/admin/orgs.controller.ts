import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  EmployerIdentityPutSchema,
  OrgCreateSchema,
  OrgPatchSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { OrgsService } from './orgs.service';

const IdSchema = z.string().uuid();

/** Sales/BD: contractor intake. Employer identity lands in the masked table. */
@Controller('contractor-orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  @Require('contractor_org:create')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.orgs.create(actor, OrgCreateSchema.parse(body).name);
  }

  @Get()
  @Require('contractor_org:read')
  list() {
    return this.orgs.list();
  }

  @Patch(':id')
  @Require('contractor_org:update')
  patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orgs.patch(
      actor,
      IdSchema.parse(id),
      OrgPatchSchema.parse(body),
    );
  }

  @Put(':id/employer')
  @Require('contractor_org:update')
  putEmployer(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.orgs.putEmployer(
      actor,
      IdSchema.parse(id),
      EmployerIdentityPutSchema.parse(body),
    );
  }
}
