import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
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
  abstract getFile(key: string): Promise<DownloadResult>;
}
