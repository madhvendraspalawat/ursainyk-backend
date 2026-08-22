import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ConfigPutSchema,
  TerritoryCreateSchema,
  TerritoryPatchSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { ConfigService } from './config.service';

const IdSchema = z.string().uuid();
const KeySchema = z.string().regex(/^[a-z][a-z0-9._-]{1,60}$/);

/** Super Admin: territory definitions + system config (feature flags = flags.* keys). */
@Controller()
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Post('territories')
  @Require('territory:create')
  createTerritory(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.config.createTerritory(
      actor,
      TerritoryCreateSchema.parse(body),
    );
  }

  @Get('territories')
  @Require('territory:read')
  territories() {
    return this.config.listTerritories();
  }

  @Patch('territories/:id')
  @Require('territory:update')
  patchTerritory(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.config.patchTerritory(
      actor,
      IdSchema.parse(id),
      TerritoryPatchSchema.parse(body),
    );
  }

  @Get('config')
  @Require('system_config:read')
  list() {
    return this.config.listConfig();
  }

  @Get('config/:key')
  @Require('system_config:read')
  get(@Param('key') key: string) {
    return this.config.getConfig(KeySchema.parse(key));
  }

  @Put('config/:key')
  @Require('system_config:configure')
  put(
    @Param('key') key: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const { value } = ConfigPutSchema.parse(body);
    return this.config.putConfig(actor, KeySchema.parse(key), value);
  }
}
