import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface SignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/** File storage seam: Cloudflare R2 in AWS environments, S3Mock locally, a fake in unit tests. */
export interface ObjectStorage {
  signUpload(key: string, contentType: string, sizeBytes: number, ttlSeconds: number): Promise<SignedUpload>;
  /** Size in bytes, or null when the object does not exist. */
  sizeOf(key: string): Promise<number | null>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: Boolean(options.endpoint),
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async signUpload(key: string, contentType: string, sizeBytes: number, ttlSeconds: number): Promise<SignedUpload> {
    // Content type and length are part of the signature, so the browser cannot upload something else.
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: ttlSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { url, method: 'PUT', headers: { 'content-type': contentType }, expiresInSeconds: ttlSeconds };
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }
}
