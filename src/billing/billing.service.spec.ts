import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ProductType, PurchaseStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

describe('BillingService (Phase K1.1 Mock Safety & Domain Hardening)', () => {
  let service: BillingService;
  let prisma: PrismaService;
  let originalEnv: string | undefined;
  let originalMockFlag: string | undefined;

  const mockProduct = {
    id: 'prod-full-access-1',
    name: 'Roteiro Completo',
    description: 'Acesso total ao roteiro',
    type: ProductType.ITINERARY_FULL_ACCESS,
    price: new Prisma.Decimal('19.99'),
    currency: 'BRL',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAiProduct = {
    id: 'prod-ai-credits-1',
    name: 'Créditos de IA',
    description: '10 créditos de IA',
    type: ProductType.AI_CREDITS,
    price: new Prisma.Decimal('14.90'),
    currency: 'BRL',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTrip = {
    id: 'trip-100',
    userId: 'user-1',
    title: 'Viagem para Paris',
    destination: 'Paris',
    status: 'DRAFT',
    premiumUnlockedAt: null,
  };

  beforeEach(async () => {
    originalEnv = process.env.NODE_ENV;
    originalMockFlag = process.env.BILLING_MOCK_PAYMENTS_ENABLED;

    process.env.NODE_ENV = 'test';
    process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        MockPaymentProvider,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findMany: jest.fn().mockResolvedValue([mockProduct]),
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === mockProduct.id) return Promise.resolve(mockProduct);
                if (where.id === mockAiProduct.id) return Promise.resolve(mockAiProduct);
                return Promise.resolve(null);
              }),
              create: jest.fn(),
              update: jest.fn(),
            },
            trip: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === mockTrip.id) return Promise.resolve(mockTrip);
                return Promise.resolve(null);
              }),
              update: jest.fn().mockResolvedValue({ ...mockTrip, premiumUnlockedAt: new Date() }),
            },
            purchase: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
              findMany: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.BILLING_MOCK_PAYMENTS_ENABLED = originalMockFlag;
  });

  describe('Mock Safety Matrix (Disabled by Default & Fail-Closed)', () => {
    it('should block mock endpoints in production even if flag is set to true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';

      await expect(
        service.createMockPurchase('user-1', { productId: mockProduct.id }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.confirmMockPayment('user-1', 'pur-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block mock endpoints in staging even if flag is set to true', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';

      await expect(
        service.createMockPurchase('user-1', { productId: mockProduct.id }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.confirmMockPayment('user-1', 'pur-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block mock endpoints in development when BILLING_MOCK_PAYMENTS_ENABLED is not set (disabled by default)', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BILLING_MOCK_PAYMENTS_ENABLED;

      await expect(
        service.createMockPurchase('user-1', { productId: mockProduct.id }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.confirmMockPayment('user-1', 'pur-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow mock endpoints in development ONLY when BILLING_MOCK_PAYMENTS_ENABLED=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';

      const mockPurchase = {
        id: 'pur-101',
        userId: 'user-1',
        productId: mockProduct.id,
        tripId: mockTrip.id,
        status: PurchaseStatus.PENDING,
        amount: new Prisma.Decimal('19.99'),
        originalAmount: new Prisma.Decimal('19.99'),
        discountAmount: new Prisma.Decimal('0.00'),
        finalAmount: new Prisma.Decimal('19.99'),
        currency: 'BRL',
        product: mockProduct,
      };

      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(mockPurchase as any);
      jest.spyOn(prisma.purchase, 'update').mockResolvedValue({
        ...mockPurchase,
        status: PurchaseStatus.PAID,
        paidAt: new Date(),
      } as any);

      const result = await service.confirmMockPayment('user-1', 'pur-101');
      expect(result.status).toBe(PurchaseStatus.PAID);
    });

    it('should block mock endpoints in test environment if BILLING_MOCK_PAYMENTS_ENABLED=false', async () => {
      process.env.NODE_ENV = 'test';
      process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'false';

      await expect(
        service.confirmMockPayment('user-1', 'pur-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Legacy Amount & Pricing Consistency', () => {
    it('should guarantee amount === finalAmount === originalAmount when discount is 0', async () => {
      process.env.NODE_ENV = 'test';
      process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';

      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.purchase, 'create').mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'pur-new-100',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      const res = await service.createMockPurchase('user-1', {
        productId: mockProduct.id,
        tripId: mockTrip.id,
      });

      expect(res.amount).toEqual(res.finalAmount);
      expect(res.originalAmount).toEqual(res.amount);
      expect(res.discountAmount).toBe(0);
    });
  });

  describe('Idempotency & Reusability', () => {
    it('should reuse existing idempotencyKey if purchase already exists', async () => {
      const existingPurchase = {
        id: 'pur-existing-idemp',
        userId: 'user-1',
        idempotencyKey: 'key-abc-123',
        status: PurchaseStatus.PENDING,
      };
      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(existingPurchase as any);

      const res = await service.createMockPurchase('user-1', {
        productId: mockProduct.id,
        idempotencyKey: 'key-abc-123',
      });

      expect(res.id).toBe('pur-existing-idemp');
    });

    it('should return existing purchase idempotently when confirming an already PAID purchase', async () => {
      const paidPurchase = {
        id: 'pur-paid-100',
        userId: 'user-1',
        status: PurchaseStatus.PAID,
        product: mockProduct,
      };
      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(paidPurchase as any);

      const res1 = await service.confirmPaidPurchase('pur-paid-100');
      const res2 = await service.confirmPaidPurchase('pur-paid-100');

      expect(res1.status).toBe(PurchaseStatus.PAID);
      expect(res2.status).toBe(PurchaseStatus.PAID);
      expect(prisma.purchase.update).not.toHaveBeenCalled();
    });
  });

  describe('Ownership & Product Entitlement', () => {
    it('should throw ForbiddenException if user tries to buy for another user trip', async () => {
      await expect(
        service.createMockPurchase('user-other-99', {
          productId: mockProduct.id,
          tripId: mockTrip.id,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if trip is already premiumUnlockedAt', async () => {
      jest.spyOn(prisma.trip, 'findUnique').mockResolvedValue({
        ...mockTrip,
        premiumUnlockedAt: new Date(),
      } as any);

      await expect(
        service.createMockPurchase('user-1', {
          productId: mockProduct.id,
          tripId: mockTrip.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should NOT unlock trip premium if product type is AI_CREDITS', async () => {
      const aiPurchase = {
        id: 'pur-ai-1',
        userId: 'user-1',
        productId: mockAiProduct.id,
        tripId: mockTrip.id,
        status: PurchaseStatus.PENDING,
        product: mockAiProduct,
      };
      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(aiPurchase as any);
      jest.spyOn(prisma.purchase, 'update').mockResolvedValue({
        ...aiPurchase,
        status: PurchaseStatus.PAID,
      } as any);

      await service.confirmPaidPurchase('pur-ai-1');
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });
});
