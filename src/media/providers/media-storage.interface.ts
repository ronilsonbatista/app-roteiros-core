export interface UploadResult {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export abstract class MediaStorageProvider {
  abstract uploadFile(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult>;
  abstract deleteFile(url: string): Promise<void>;
}
