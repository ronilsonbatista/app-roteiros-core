import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MediaStorageProvider,
  UploadResult,
  DownloadResult,
  StoredObjectUrl,
} from './media-storage.interface';
import { normalizeStorageKey } from './storage-key';
import * as crypto from 'crypto';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class S3MediaStorageProvider implements MediaStorageProvider {
  private readonly logger = new Logger(S3MediaStorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'us-east-1';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';

    this.s3Client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
      forcePathStyle: Boolean(endpoint),
    });

    this.baseUrl = (
      process.env.MEDIA_BASE_URL ||
      process.env.S3_PUBLIC_URL ||
      ''
    ).replace(/\/$/, '');
  }

  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;
    const key = folder ? `${folder}/${filename}` : filename;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    const url = this.baseUrl ? `${this.baseUrl}/${key}` : `/media/file/${key}`;

    this.logger.log(`File uploaded to S3: ${url} (key: ${key})`);

    return {
      url,
      filename,
      key,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async resolveReadUrl(key: string): Promise<StoredObjectUrl> {
    const clean = normalizeStorageKey(key);
    const publicBase = (process.env.IMAGE_BANK_PUBLIC_BASE_URL || '').replace(
      /\/$/,
      '',
    );
    if (publicBase) {
      return { url: `${publicBase}/${clean}`, expiresAt: null };
    }

    const ttl = signedUrlTtlSeconds();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: clean,
    });
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: ttl });
    return {
      url,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async deleteByKey(key: string): Promise<void> {
    const clean = normalizeStorageKey(key);
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: clean,
        }),
      );
      this.logger.log(`File deleted from S3 by key: ${clean}`);
    } catch (error) {
      this.logger.error(`Error deleting key from S3: ${clean}`, error);
      throw error;
    }
  }

  async getFile(key: string): Promise<DownloadResult> {
    const cleanKey = normalizeStorageKey(key);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new NotFoundException(
          `Arquivo não encontrado no storage: ${cleanKey}`,
        );
      }

      return {
        stream: response.Body as unknown as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
      };
    } catch (err: unknown) {
      if (isMissingObject(err)) {
        throw new NotFoundException(`Arquivo não encontrado: ${cleanKey}`);
      }
      this.logger.error(`Error reading file from S3: ${cleanKey}`, err);
      throw err;
    }
  }

  async deleteFile(urlOrKey: string): Promise<void> {
    try {
      let key = urlOrKey;
      if (this.baseUrl && urlOrKey.startsWith(this.baseUrl)) {
        key = urlOrKey.replace(`${this.baseUrl}/`, '');
      } else if (urlOrKey.startsWith('/media/file/')) {
        key = urlOrKey.replace('/media/file/', '');
      } else if (urlOrKey.startsWith('http')) {
        const urlObj = new URL(urlOrKey);
        key = urlObj.pathname
          .replace(/^\/media\/file\//, '')
          .replace(/^\//, '');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted from S3: ${key}`);
    } catch (error: unknown) {
      this.logger.error(`Error deleting file from S3: ${urlOrKey}`, error);
    }
  }
}

function isMissingObject(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('name' in err && err.name === 'NoSuchKey') return true;
  if (
    !('$metadata' in err) ||
    !err.$metadata ||
    typeof err.$metadata !== 'object'
  ) {
    return false;
  }
  return (
    'httpStatusCode' in err.$metadata && err.$metadata.httpStatusCode === 404
  );
}

function signedUrlTtlSeconds(): number {
  const parsed = Number(process.env.IMAGE_BANK_SIGNED_URL_TTL_SECONDS || '900');
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 86_400) {
    return 900;
  }
  return parsed;
}
