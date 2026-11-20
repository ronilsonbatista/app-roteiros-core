import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  filename: string;
  /** Chave relativa no storage (sem host). É o que o banco de imagens persiste. */
  key: string;
  mimeType: string;
  size: number;
}

export interface StoredObjectUrl {
  url: string;
  /** ISO-8601 quando a URL é assinada. Null para path público de dev. */
  expiresAt: string | null;
}

export interface DownloadResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
}

export abstract class MediaStorageProvider {
  abstract uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult>;
  abstract deleteFile(url: string): Promise<void>;
  abstract deleteByKey(key: string): Promise<void>;
  abstract getFile(key: string): Promise<DownloadResult>;
  /** URL assinada (S3/R2/MinIO) ou path público (filesystem de dev). Nunca devolve o binário. */
  abstract resolveReadUrl(key: string): Promise<StoredObjectUrl>;
}
