import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: any;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...originalEnv };
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return detailed status in development/staging', async () => {
    process.env.NODE_ENV = 'staging';
    const mockRes = { status: jest.fn() } as any;

    const res = await controller.getHealth(mockRes);

    expect(res).toHaveProperty('api', 'OK');
    expect(res).toHaveProperty('database', 'OK');
    expect(res).toHaveProperty('openaiConfigured');
    expect(res).toHaveProperty('uploadFolderStatus');
  });

  it('should return minimal { status: "OK" } in production when healthy', async () => {
    process.env.NODE_ENV = 'production';
    const mockRes = { status: jest.fn() } as any;

    const res = await controller.getHealth(mockRes);

    expect(res).toEqual({ status: 'OK' });
    expect(res).not.toHaveProperty('openaiConfigured');
    expect(res).not.toHaveProperty('uploadFolderStatus');
  });

  it('should return { status: "DOWN" } and 503 status code in production when DB fails', async () => {
    process.env.NODE_ENV = 'production';
    prisma.$queryRaw.mockRejectedValue(new Error('DB failure'));
    const mockRes = { status: jest.fn() } as any;

    const res = await controller.getHealth(mockRes);

    expect(res).toEqual({ status: 'DOWN' });
    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
