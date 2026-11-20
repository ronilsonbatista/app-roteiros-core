import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaStorageProvider,
  UploadResult,
  DownloadResult,
  StoredObjectUrl,
} from './media-storage.interface';
import { normalizeStorageKey } from './storage-key';
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
    }
    await fs.promises.mkdir(targetDir, { recursive: true });

    const filePath = path.join(targetDir, filename);
    await fs.promises.writeFile(filePath, file.buffer);

    // URL acessível pelo front-end
    const relativeUrlPath = folder ? `${folder}/${filename}` : filename;
    const url = `${this.baseUrl}/${relativeUrlPath}`;

    this.logger.log(`File uploaded: ${url}`);

    return {
      url,
      filename,
      key: relativeUrlPath,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  resolveReadUrl(key: string): Promise<StoredObjectUrl> {
    const clean = normalizeStorageKey(key);
    const publicBase = (process.env.IMAGE_BANK_PUBLIC_BASE_URL || '').replace(
      /\/$/,
      '',
    );
    if (publicBase) {
      return Promise.resolve({
        url: `${publicBase}/${clean}`,
        expiresAt: null,
      });
    }
    const base = this.baseUrl.replace(/\/$/, '');
    return Promise.resolve({ url: `${base}/${clean}`, expiresAt: null });
  }

  async deleteByKey(key: string): Promise<void> {
    const filePath = this.resolveInsideUploadDir(key);
    try {
      await fs.promises.unlink(filePath);
      this.logger.log(`File deleted by key: ${filePath}`);
    } catch (error) {
      if (nodeErrorCode(error) === 'ENOENT') return;
      throw error;
    }
  }

  async getFile(key: string): Promise<DownloadResult> {
    const filePath = this.resolveInsideUploadDir(key);
    const cleanKey = normalizeStorageKey(key);
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (nodeErrorCode(error) === 'ENOENT') {
        throw new NotFoundException(`Arquivo não encontrado: ${cleanKey}`);
      }
      throw error;
    }

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
      await fs.promises.unlink(filePath);
      this.logger.log(`File deleted: ${filePath}`);
    } catch (error) {
      if (nodeErrorCode(error) === 'ENOENT') return;
      this.logger.error(`Error deleting file: ${url}`, error);
    }
  }

  private resolveInsideUploadDir(key: string): string {
    const clean = normalizeStorageKey(key);
    const root = path.resolve(this.uploadDir);
    const filePath = path.resolve(root, clean);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      throw new BadRequestException('Chave de storage inválida');
    }
    return filePath;
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
