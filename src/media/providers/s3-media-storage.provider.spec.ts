import { S3MediaStorageProvider } from './s3-media-storage.provider';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

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
    delete process.env.IMAGE_BANK_PUBLIC_BASE_URL;
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
    expect(result.url).toMatch(
      /^https:\/\/cdn\.example\.com\/media\/file\/avatars\/.+\.png$/,
    );
    expect(result.key).toMatch(/^avatars\/.+\.png$/);
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
    await provider.deleteFile(
      'https://cdn.example.com/media/file/avatars/sample.png',
    );

    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });

  it('returns a signed read url and not the object body', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://signed.example/object?X-Amz-Signature=abc',
    );
    const provider = new S3MediaStorageProvider();
    const result = await provider.resolveReadUrl('image-bank/city/photo.jpg');

    expect(result.url).toBe(
      'https://signed.example/object?X-Amz-Signature=abc',
    );
    expect(result.expiresAt).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('stream');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns a public url when IMAGE_BANK_PUBLIC_BASE_URL is set', async () => {
    (getSignedUrl as jest.Mock).mockClear();
    process.env.IMAGE_BANK_PUBLIC_BASE_URL = 'https://cdn.example.com/bank';
    const provider = new S3MediaStorageProvider();
    const result = await provider.resolveReadUrl('image-bank/city/photo.jpg');

    expect(result).toEqual({
      url: 'https://cdn.example.com/bank/image-bank/city/photo.jpg',
      expiresAt: null,
    });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
