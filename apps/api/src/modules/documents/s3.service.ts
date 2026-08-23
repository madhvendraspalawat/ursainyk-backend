import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGN_TTL_SECONDS = 600;

/** S3-compatible storage (MinIO locally, S3 ap-south-1 in prod). Signed URLs only. */
@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger('S3Service');
  readonly bucket = process.env.S3_BUCKET ?? 'nabhahita-documents';
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'ap-south-1',
    forcePathStyle: true, // MinIO
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minio',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minio12345',
    },
  });

  /** Dev convenience: MinIO starts empty. Prod buckets are provisioned, not created here. */
  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`created bucket ${this.bucket}`);
      } catch (e) {
        this.logger.warn(`bucket check failed: ${String(e).slice(0, 120)}`);
      }
    }
  }

  presignUpload(key: string, mime: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mime,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
  }

  presignDownload(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Serving hardening: force download + the stored content type, so a
        // crafted file can never render/execute in a portal browser tab.
        ResponseContentDisposition: 'attachment',
      }),
      {
        expiresIn: PRESIGN_TTL_SECONDS,
      },
    );
  }

  async objectSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }
}
