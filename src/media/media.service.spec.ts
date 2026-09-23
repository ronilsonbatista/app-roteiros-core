import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageProvider } from './providers/media-storage.interface';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: any;
  let mediaProvider: jest.Mocked<MediaStorageProvider>;

  beforeEach(async () => {
    prisma = {
      user: { update: jest.fn() },
      baseTrip: { findUnique: jest.fn(), update: jest.fn() },
      baseAttraction: { findUnique: jest.fn(), update: jest.fn() },
      baseRestaurant: { findUnique: jest.fn(), update: jest.fn() },
      trip: { findUnique: jest.fn(), update: jest.fn() },
    };

    mediaProvider = {
      uploadFile: jest.fn().mockResolvedValue({
        url: 'https://cdn.2go.com/avatars/test.jpg',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaStorageProvider, useValue: mediaProvider },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadAvatar', () => {
    it('should throw BadRequestException if no file is provided', async () => {
      await expect(service.uploadAvatar('user_123', null as any)).rejects.toThrow(BadRequestException);
    });

    it('should upload file and update user photoUrl', async () => {
      const mockFile = {
        buffer: Buffer.from('fake-image'),
        originalname: 'avatar.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
      } as Express.Multer.File;

      const result = await service.uploadAvatar('user_123', mockFile);

      expect(mediaProvider.uploadFile).toHaveBeenCalledWith(mockFile, 'avatars');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { photoUrl: 'https://cdn.2go.com/avatars/test.jpg' },
      });
      expect(result.url).toBe('https://cdn.2go.com/avatars/test.jpg');
    });
  });

  describe('uploadBaseTripCover', () => {
    it('should throw NotFoundException if base trip not found', async () => {
      prisma.baseTrip.findUnique.mockResolvedValue(null);
      const mockFile = { originalname: 'trip.jpg' } as Express.Multer.File;

      await expect(service.uploadBaseTripCover('trip_999', mockFile)).rejects.toThrow(NotFoundException);
    });
  });
});
