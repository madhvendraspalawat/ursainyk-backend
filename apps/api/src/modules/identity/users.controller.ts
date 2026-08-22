import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateUserSchema,
  GrantRoleSchema,
  UpdateUserStatusSchema,
} from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from './auth-user';
import { Require } from './require.decorator';
import { UsersService } from './users.service';

const UserIdSchema = z.string().uuid();
const RoleParamSchema = GrantRoleSchema.shape.role;

/** Portal-user administration. Matrix gates the door; UsersService gates the details. */
@Controller('identity/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Require('user_account:create')
  create(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.users.createPortalUser(actor, CreateUserSchema.parse(body));
  }

  @Post(':id/roles')
  @HttpCode(204)
  @Require('user_account:configure')
  async grant(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const { role } = GrantRoleSchema.parse(body);
    await this.users.grantRole(actor, UserIdSchema.parse(id), role);
  }

  @Delete(':id/roles/:role')
  @HttpCode(204)
  @Require('user_account:configure')
  async revoke(
    @Param('id') id: string,
    @Param('role') role: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.users.revokeRole(
      actor,
      UserIdSchema.parse(id),
      RoleParamSchema.parse(role),
    );
  }

  @Patch(':id/status')
  @HttpCode(204)
  @Require('user_account:update')
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthUser,
  ) {
    const { status } = UpdateUserStatusSchema.parse(body);
    await this.users.setStatus(actor, UserIdSchema.parse(id), status);
  }

  @Post(':id/reset-password')
  @Require('user_account:update')
  resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.resetPassword(actor, UserIdSchema.parse(id));
  }
}
