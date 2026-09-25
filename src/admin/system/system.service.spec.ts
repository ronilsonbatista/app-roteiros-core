import { Test, TestingModule } from '@nestjs/testing';
import { SystemService } from './system.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SystemService', () => {
  let service: SystemService;
  let prisma: any;

  const mockPrisma = {
    $queryRaw: jest.fn(),
    user: { findMany: jest.fn() },
    trip: { findMany: jest.fn() },
    purchase: { findMany: jest.fn() },
    blogPost: { findMany: jest.fn() },
    knowledgeArticle: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SystemService>(SystemService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('getProviderHealth', () => {
    it('should return health status without exposing sensitive credentials', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      const res = await service.getProviderHealth();

      expect(res.providers.database.status).toBe('HEALTHY');
      expect(res.providers.openai).toBeDefined();
      expect(res.providers.email).toBeDefined();
      expect(res.providers.mercadoPago).toBeDefined();
      // Ensure no raw secrets are leaked
      const stringified = JSON.stringify(res);
      expect(stringified).not.toContain('sk-');
      expect(stringified).not.toContain('re_');
    });
  });

  describe('globalSearch', () => {
    it('should return empty results if search query is too short', async () => {
      const res = await service.globalSearch('a');
      expect(res.users).toEqual([]);
      expect(res.trips).toEqual([]);
    });

    it('should execute parallel queries across entities for valid query', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'Carlos Silva', email: 'carlos@ex.com' }]);
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.purchase.findMany.mockResolvedValue([]);
      mockPrisma.blogPost.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeArticle.findMany.mockResolvedValue([]);

      const res = await service.globalSearch('Carlos');
      expect(res.users).toHaveLength(1);
      expect(res.users[0].fullName).toBe('Carlos Silva');
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
    });
  });
});
