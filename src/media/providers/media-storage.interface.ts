export interface UploadResult {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MediaStorageProvider {
  uploadFile(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
  deleteFile(url: string): Promise<void>;
}
