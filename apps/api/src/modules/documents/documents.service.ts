import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DocumentUploadRequest } from '@ursainyk/contracts';
import { withGlobalScope, type Document } from '@ursainyk/db';
import { scopeOf } from '@ursainyk/rbac';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../notifications/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import type { AuthUser } from '../identity/auth-user';

/**
 * Résumé documents: presigned upload → confirm → outbox `document.uploaded`
 * → worker parses async (ADR-0008). Access is scoped through the owning
 * candidate: candidates their own, ESM their territory, admins all.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async requestUpload(actor: AuthUser, input: DocumentUploadRequest) {
    const candidate = await this.resolveCandidate(actor, input.candidateId);
    const s3Key = `resumes/${candidate.id}/${randomUUID()}`;
    const doc = await this.prisma.db.document.create({
      data: {
        candidateId: candidate.id,
        kind: input.kind,
        mime: input.mime,
        s3Key,
        uploadedById: actor.userId,
      },
    });
    const uploadUrl = await this.s3.presignUpload(s3Key, input.mime);
    return { documentId: doc.id, uploadUrl, expiresInSeconds: 600 };
  }

  /** Client confirms the PUT succeeded → queue the parse via the outbox. */
  async confirm(actor: AuthUser, documentId: string): Promise<Document> {
    const doc = await this.ownedDocument(actor, documentId);
    if (doc.status !== 'PENDING_UPLOAD')
      throw new BadRequestException(`already ${doc.status.toLowerCase()}`);
    const size = await this.s3.objectSize(doc.s3Key);
    if (size === null)
      throw new BadRequestException(
        'object not found in storage — upload first',
      );

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id: doc.id },
        data: { status: 'UPLOADED', sizeBytes: size },
      });
      await this.outbox.emit('document.uploaded', { documentId: doc.id }, tx);
      return row;
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      action: 'document.upload',
      entity: 'Document',
      entityId: doc.id,
    });
    return updated;
  }

  async get(actor: AuthUser, documentId: string) {
    const doc = await this.ownedDocument(actor, documentId);
    return { ...doc, downloadUrl: await this.s3.presignDownload(doc.s3Key) };
  }

  // ── scoping ───────────────────────────────────────────────────────────────

  private async resolveCandidate(actor: AuthUser, candidateId?: string) {
    const scope = scopeOf(actor.roles, 'candidate_profile', 'update');
    if (scope === 'own') {
      const self = await withGlobalScope(this.prisma.db, (tx) =>
        tx.candidate.findUnique({ where: { userId: actor.userId } }),
      );
      if (!self) throw new NotFoundException('create your profile first');
      if (candidateId && candidateId !== self.id)
        throw new ForbiddenException('own uploads only');
      return self;
    }
    if (!candidateId) throw new BadRequestException('candidateId required');
    const where =
      scope === 'territory'
        ? { id: candidateId, territoryId: { in: actor.territoryIds } }
        : { id: candidateId };
    const candidate = await withGlobalScope(this.prisma.db, (tx) =>
      tx.candidate.findFirst({ where }),
    );
    if (!candidate) throw new NotFoundException('candidate not found');
    return candidate;
  }

  private async ownedDocument(
    actor: AuthUser,
    documentId: string,
  ): Promise<Document> {
    const doc = await this.prisma.db.document.findUnique({
      where: { id: documentId },
      include: { candidate: true },
    });
    if (!doc) throw new NotFoundException('document not found');
    const scope = scopeOf(actor.roles, 'candidate_profile', 'read');
    const allowed =
      scope === 'all' ||
      (scope === 'own' && doc.candidate.userId === actor.userId) ||
      (scope === 'territory' &&
        doc.candidate.territoryId !== null &&
        actor.territoryIds.includes(doc.candidate.territoryId));
    if (!allowed) throw new NotFoundException('document not found');
    return doc;
  }
}
