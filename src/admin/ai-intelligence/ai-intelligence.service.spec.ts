import { Test, TestingModule } from '@nestjs/testing';
import { AiIntelligenceService } from './ai-intelligence.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AiIntelligenceService', () => {
  let service: AiIntelligenceService;
  let prisma: any;

  const mockPrisma = {
    aIGuideline: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    knowledgeArticle: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    trip: {
      create: jest.fn(),
    },
    purchase: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiIntelligenceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiIntelligenceService>(AiIntelligenceService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('editorialAssist', () => {
    it('should provide deterministic fallback when OpenAI API key is not present', async () => {
      const res = await service.editorialAssist({
        action: 'GENERATE_DRAFT',
        destination: 'Roma',
        topic: 'Dicas de Roma',
      });

      expect(res.action).toBe('GENERATE_DRAFT');
      expect(res.output).toContain('Roma');
      expect(res.provider).toBe('mock-editorial');
    });

    it('should handle title suggestions in fallback mode', async () => {
      const res = await service.editorialAssist({
        action: 'SUGGEST_TITLES',
        destination: 'Paris',
      });

      expect(res.action).toBe('SUGGEST_TITLES');
      expect(res.output).toContain('Paris');
    });
  });

  describe('playgroundSimulate', () => {
    it('should return isolated simulation without writing to Trip or Purchase tables', async () => {
      const res = await service.playgroundSimulate({
        destination: 'Tóquio',
        numberOfDays: 3,
        travelStyle: 'Cultura & Gastronomia',
        budgetLevel: 'HIGH',
      });

      expect(res.success).toBe(true);
      expect(res.simulationData.destination).toBe('Tóquio');
      expect(res.simulationData.days).toHaveLength(3);
      expect(mockPrisma.trip.create).not.toHaveBeenCalled();
      expect(mockPrisma.purchase.create).not.toHaveBeenCalled();
    });
  });

  describe('knowledgeArticles', () => {
    it('should list articles with filtering', async () => {
      mockPrisma.knowledgeArticle.findMany.mockResolvedValue([
        { id: 'k1', title: 'Regras de Bagagem', category: 'LOGISTICS' },
      ]);

      const res = await service.getKnowledgeArticles('LOGISTICS');
      expect(res).toHaveLength(1);
      expect(mockPrisma.knowledgeArticle.findMany).toHaveBeenCalled();
    });
  });
});
