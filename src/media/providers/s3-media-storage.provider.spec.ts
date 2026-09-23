import { S3MediaStorageProvider } from './s3-media-storage.provider';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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
      MEDIA_BASE_URL: 'https://cdn.example.com/media/file',
    };
    mockSend = jest.fn().mockResolvedValue({});
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should upload file and return public proxy URL', async () => {
    const provider = new S3MediaStorageProvider();
    const mockFile = {
      buffer: Buffer.from('test-content'),
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 100,
    } as Express.Multer.File;

    const result = await provider.uploadFile(mockFile, 'avatars');

    expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/media\/file\/avatars\/.+\.png$/);
    expect(result.mimeType).toBe('image/png');
  });

  it('should get file and return download stream', async () => {
    const mockStream = new Readable({
      read() {
        this.push('file-body');
        this.push(null);
      },
    });

    mockSend.mockResolvedValueOnce({
      Body: mockStream,
      ContentType: 'image/png',
      ContentLength: 9,
    });

    const provider = new S3MediaStorageProvider();
    const result = await provider.getFile('avatars/photo.png');

    expect(mockSend).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    expect(result.contentType).toBe('image/png');
    expect(result.contentLength).toBe(9);
    expect(result.stream).toBeDefined();
  });

  it('should delete file from S3 bucket', async () => {
    const provider = new S3MediaStorageProvider();
    await provider.deleteFile('https://cdn.example.com/media/file/avatars/sample.png');

    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });
});
