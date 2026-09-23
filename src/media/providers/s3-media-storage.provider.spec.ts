import { S3MediaStorageProvider } from './s3-media-storage.provider';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3');

describe('S3MediaStorageProvider', () => {
  const originalEnv = process.env;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      S3_BUCKET: 'test-bucket',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'test-key',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      MEDIA_BASE_URL: 'https://cdn.example.com',
    };
    mockSend = jest.fn().mockResolvedValue({});
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should upload file and return public URL', async () => {
    const provider = new S3MediaStorageProvider();
    const mockFile = {
      buffer: Buffer.from('test-content'),
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 100,
    } as Express.Multer.File;

    const result = await provider.uploadFile(mockFile, 'avatars');

    expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/avatars\/.+\.png$/);
    expect(result.mimeType).toBe('image/png');
  });

  it('should delete file from S3 bucket', async () => {
    const provider = new S3MediaStorageProvider();
    await provider.deleteFile('https://cdn.example.com/avatars/sample.png');

    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });
});
