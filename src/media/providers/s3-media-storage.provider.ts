import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { MediaStorageProvider, UploadResult } from './media-storage.interface';
import * as crypto from 'crypto';
import * as path from 'path';

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
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;

    this.logger.log(`File uploaded to S3: ${url}`);

    return {
      url,
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async deleteFile(url: string): Promise<void> {
    try {
      let key = url;
      if (this.baseUrl && url.startsWith(this.baseUrl)) {
        key = url.replace(`${this.baseUrl}/`, '');
      } else {
        const urlObj = new URL(url);
        key = urlObj.pathname.replace(/^\//, '');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted from S3: ${key}`);
    } catch (error: any) {
      this.logger.error(`Error deleting file from S3: ${url}`, error);
    }
  }
}
