import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import {
  MediaStorageProvider,
  UploadResult,
  DownloadResult,
} from './media-storage.interface';
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

    const url = this.baseUrl
      ? `${this.baseUrl}/${key}`
      : `/media/file/${key}`;

    this.logger.log(`File uploaded to S3: ${url} (key: ${key})`);

    return {
      url,
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async getFile(key: string): Promise<DownloadResult> {
    const cleanKey = key.replace(/^\//, '');
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });

      const response = await this.s3Client.send(command);
      if (!response.Body) {
        throw new NotFoundException(`Arquivo não encontrado no storage: ${cleanKey}`);
      }

      return {
        stream: response.Body as unknown as Readable,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
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
        key = urlObj.pathname.replace(/^\/media\/file\//, '').replace(/^\//, '');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted from S3: ${key}`);
    } catch (error: any) {
      this.logger.error(`Error deleting file from S3: ${urlOrKey}`, error);
    }
  }
}
