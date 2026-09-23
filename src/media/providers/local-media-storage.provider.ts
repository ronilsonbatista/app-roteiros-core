import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MediaStorageProvider,
  UploadResult,
  DownloadResult,
} from './media-storage.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class LocalMediaStorageProvider implements MediaStorageProvider {
  private readonly logger = new Logger(LocalMediaStorageProvider.name);
  private readonly baseUrl: string;
  private readonly uploadDir: string;

  constructor() {
    this.baseUrl =
      process.env.MEDIA_BASE_URL || 'http://localhost:3000/uploads';
    this.uploadDir = path.join(process.cwd(), 'uploads');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;

    let targetDir = this.uploadDir;
    if (folder) {
      targetDir = path.join(this.uploadDir, folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const filePath = path.join(targetDir, filename);

    // Salvar fisicamente
    fs.writeFileSync(filePath, file.buffer);

    // URL acessível pelo front-end
    const relativeUrlPath = folder ? `${folder}/${filename}` : filename;
    const url = `${this.baseUrl}/${relativeUrlPath}`;

    this.logger.log(`File uploaded: ${url}`);

    return {
      url,
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async getFile(key: string): Promise<DownloadResult> {
    const cleanKey = key.replace(/^\//, '');
    const filePath = path.join(this.uploadDir, cleanKey);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Arquivo não encontrado: ${cleanKey}`);
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    const ext = path.extname(cleanKey).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
    };

    return {
      stream,
      contentType: mimeMap[ext] || 'application/octet-stream',
      contentLength: stat.size,
    };
  }

  async deleteFile(url: string): Promise<void> {
    if (!url.startsWith(this.baseUrl)) return;

    try {
      const relativePath = url.replace(`${this.baseUrl}/`, '');
      const filePath = path.join(this.uploadDir, relativePath);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`File deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting file: ${url}`, error);
    }
  }
}
