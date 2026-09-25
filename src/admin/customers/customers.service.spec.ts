import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      guestJourney: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCustomers', () => {
    it('should return paginated customers with calculated lifecycle stage and total spent', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          fullName: 'Alice Walker',
          email: 'alice@example.com',
          phone: '+5511999999999',
          role: 'USER',
          origin: 'web',
          marketingConsent: true,
          emailConfirmed: true,
          blockedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActiveAt: new Date(),
          _count: { trips: 2, purchases: 1 },
          purchases: [{ finalAmount: 29.9 }],
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const res = await service.getCustomers({ page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].stage).toBe('CUSTOMER');
      expect(res.data[0].totalSpent).toBe(29.9);
      expect(res.meta.total).toBe(1);
    });
  });

  describe('getCustomer360', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getCustomer360('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should build a comprehensive chronological timeline of customer events', async () => {
      const now = new Date();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        fullName: 'Bob Travel',
        email: 'bob@example.com',
        role: 'USER',
        origin: 'mobile',
        marketingConsent: true,
        createdAt: new Date(now.getTime() - 100000),
        updatedAt: now,
        travelProfile: {
          id: 'tp1',
          preferredStyles: ['COMFORT'],
          createdAt: new Date(now.getTime() - 80000),
        },
        trips: [
          {
            id: 'trip-1',
            title: 'Viagem a Roma',
            destination: 'Roma, Itália',
            status: 'ACTIVE',
            days: [{ _count: { items: 3 } }],
            createdAt: new Date(now.getTime() - 50000),
            premiumUnlockedAt: new Date(now.getTime() - 40000),
          },
        ],
        purchases: [
          {
            id: 'p1',
            status: 'PAID',
            amount: 29.9,
            discountAmount: 0,
            finalAmount: 29.9,
            currency: 'BRL',
            paymentMethod: 'PIX',
            paidAt: new Date(now.getTime() - 40000),
            createdAt: new Date(now.getTime() - 45000),
            product: { name: 'Acesso Completo' },
          },
        ],
        claimedGuestJourneys: [],
        aiRequests: [],
        campaignRecipients: [],
      });

      const res = await service.getCustomer360('u1');
      expect(res.profile.fullName).toBe('Bob Travel');
      expect(res.metrics.totalSpent).toBe(29.9);
      expect(res.timeline.length).toBeGreaterThanOrEqual(4);
      // Timeline should be sorted descending
      expect(res.timeline[0].timestamp.getTime()).toBeGreaterThanOrEqual(
        res.timeline[res.timeline.length - 1].timestamp.getTime(),
      );
    });
  });

  describe('updateConsent', () => {
    it('should update user marketing consent flag', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', marketingConsent: true });
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        marketingConsent: false,
        marketingConsentAt: new Date(),
        unsubscribedAt: new Date(),
      });

      const res = await service.updateConsent('u1', false);
      expect(res.marketingConsent).toBe(false);
      expect(res.unsubscribedAt).toBeDefined();
    });
  });
});
