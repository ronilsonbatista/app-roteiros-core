import { Test, TestingModule } from '@nestjs/testing';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: any;
  let emailService: any;

  beforeEach(async () => {
    prisma = {
      segment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      emailTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      campaign: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    emailService = {
      sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<MarketingService>(MarketingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('previewAudience (LGPD & Consent Enforcement)', () => {
    it('should exclude non-consenting users from eligible count', async () => {
      // 100 total matching criteria, but only 70 with consent
      prisma.user.count
        .mockResolvedValueOnce(100) // totalMatching
        .mockResolvedValueOnce(70);  // eligibleCount
      prisma.user.findMany.mockResolvedValue([
        { id: '1', fullName: 'John Doe', email: 'john@example.com' },
      ]);

      const res = await service.previewAudience({ hasPurchases: true });
      expect(res.totalMatching).toBe(100);
      expect(res.eligibleCount).toBe(70);
      expect(res.suppressedCount).toBe(30);
      expect(res.sampleRecipients).toHaveLength(1);
    });
  });

  describe('dryRun', () => {
    it('should produce a dry-run report without sending real emails', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Campanha Paris',
        subject: 'Descubra {{destination}}, {{name}}!',
        content: 'Olá {{name}}, temos dicas para {{destination}}.',
        status: 'DRAFT',
        segmentId: null,
      });

      prisma.user.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(45);
      prisma.user.findMany.mockResolvedValue([
        { id: '1', fullName: 'Maria Silva', email: 'maria@example.com' },
      ]);

      const dry = await service.dryRun('c1');
      expect(dry.audience.totalEligible).toBe(45);
      expect(dry.audience.totalSuppressedNoConsent).toBe(5);
      expect(dry.preview.renderedSubject).toContain('Descubra Paris, Maria Silva!');
      expect(dry.preview.renderedContent).toContain('Olá Maria Silva');
    });
  });

  describe('scheduleOrSend', () => {
    it('should throw ForbiddenException if running in production and MARKETING_EMAIL_ENABLED is false', async () => {
      const origEnv = process.env.NODE_ENV;
      const origFlag = process.env.MARKETING_EMAIL_ENABLED;
      process.env.NODE_ENV = 'production';
      process.env.MARKETING_EMAIL_ENABLED = 'false';

      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c1',
        name: 'Test',
        status: 'DRAFT',
      });

      await expect(service.scheduleOrSend('c1')).rejects.toThrow(ForbiddenException);

      process.env.NODE_ENV = origEnv;
      process.env.MARKETING_EMAIL_ENABLED = origFlag;
    });
  });
});
