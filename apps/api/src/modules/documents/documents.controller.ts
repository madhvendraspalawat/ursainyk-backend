import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DocumentUploadRequestSchema } from '@ursainyk/contracts';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../identity/auth-user';
import { Require } from '../identity/require.decorator';
import { DocumentsService } from './documents.service';

const IdSchema = z.string().uuid();

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Presigned PUT URL. Candidate: own profile; ESM: candidateId in territory. */
  @Post('uploads')
  @Require('candidate_profile:update')
  requestUpload(@Body() body: unknown, @CurrentUser() actor: AuthUser) {
    return this.documents.requestUpload(
      actor,
      DocumentUploadRequestSchema.parse(body),
    );
  }

  /** Confirm the upload landed → parse job queued (outbox → worker). */
  @Post(':id/confirm')
  @Require('candidate_profile:update')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.documents.confirm(actor, IdSchema.parse(id));
  }

  @Get(':id')
  @Require('candidate_profile:read')
  get(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.documents.get(actor, IdSchema.parse(id));
  }
}
