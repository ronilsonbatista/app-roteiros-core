import { Test, TestingModule } from '@nestjs/testing';
import { MediaPublicController } from './media-public.controller';
import { MediaService } from './media.service';
import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';

describe('MediaPublicController', () => {
  let controller: MediaPublicController;
  let mediaService: any;

  beforeEach(async () => {
    mediaService = {
      getFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaPublicController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();

    controller = module.get<MediaPublicController>(MediaPublicController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should pipe file stream and set headers on getMediaByFolder', async () => {
    const mockStream = new Readable({
      read() {
        this.push('file-content');
        this.push(null);
      },
    });

    mediaService.getFile.mockResolvedValue({
      stream: mockStream,
      contentType: 'image/png',
      contentLength: 12,
    });

    const mockRes = {
      setHeader: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any;

    await controller.getMediaByFolder('avatars', 'user1.png', mockRes);

    expect(mediaService.getFile).toHaveBeenCalledWith('avatars/user1.png');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 12);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
  });

  it('should throw NotFoundException if mediaService throws NotFoundException', async () => {
    mediaService.getFile.mockRejectedValue(new NotFoundException());
    const mockRes = { setHeader: jest.fn() } as any;

    await expect(
      controller.getMediaByFolder('avatars', 'non-existent.png', mockRes),
    ).rejects.toThrow(NotFoundException);
  });
});
