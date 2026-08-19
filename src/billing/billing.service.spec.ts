import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { MercadoPagoPaymentProvider } from './providers/mercadopago-payment.provider';
import { PaymentMethodType } from './dto/billing.dto';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ProductType, PurchaseStatus, Prisma } from '@prisma/client';

describe('BillingService (Phase K2B Mercado Pago & Checkout)', () => {
  let service: BillingService;
  let prisma: PrismaService;
  let mercadoPagoProvider: MercadoPagoPaymentProvider;
  let originalEnv: string | undefined;
  let originalMockFlag: string | undefined;
  let originalProviderEnv: string | undefined;

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
    originalProviderEnv = process.env.PAYMENT_PROVIDER;

    process.env.NODE_ENV = 'test';
    process.env.BILLING_MOCK_PAYMENTS_ENABLED = 'true';
    delete process.env.PAYMENT_PROVIDER;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        MockPaymentProvider,
        MercadoPagoPaymentProvider,
        {
          provide: PrismaService,
          useValue: {
            product: {
              findMany: jest.fn().mockResolvedValue([mockProduct]),
              findFirst: jest.fn().mockResolvedValue(mockProduct),
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
              create: jest.fn().mockImplementation(({ data }: any) => {
                return Promise.resolve({
                  id: 'pur-created-123',
                  ...data,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }),
              update: jest.fn().mockImplementation(({ where, data }: any) => {
                return Promise.resolve({
                  id: where.id,
                  userId: 'user-1',
                  productId: mockProduct.id,
                  tripId: mockTrip.id,
                  status: data.status || PurchaseStatus.PENDING,
                  amount: mockProduct.price,
                  finalAmount: mockProduct.price,
                  currency: 'BRL',
                  provider: data.provider || 'MOCK',
                  providerPaymentId: data.providerPaymentId || 'mp-123',
                  paymentMethod: data.paymentMethod || 'PIX',
                });
              }),
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
    mercadoPagoProvider = module.get<MercadoPagoPaymentProvider>(MercadoPagoPaymentProvider);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.BILLING_MOCK_PAYMENTS_ENABLED = originalMockFlag;
    process.env.PAYMENT_PROVIDER = originalProviderEnv;
  });

  describe('Checkout Summary API', () => {
    it('should return checkout summary with core resolved product and supported payment methods', async () => {
      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(null);

      const summary = await service.getCheckoutSummary('user-1', mockTrip.id);

      expect(summary.tripId).toBe(mockTrip.id);
      expect(summary.alreadyUnlocked).toBe(false);
      expect(summary.product.id).toBe(mockProduct.id);
      expect(summary.pricing.finalAmount).toBe(19.99);
      expect(summary.supportedPaymentMethods).toEqual(['PIX', 'CARD']);
    });

    it('should throw ForbiddenException if user tries to get checkout summary for another user trip', async () => {
      await expect(
        service.getCheckoutSummary('user-other-99', mockTrip.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return alreadyUnlocked = true if trip premiumUnlockedAt is set', async () => {
      jest.spyOn(prisma.trip, 'findUnique').mockResolvedValue({
        ...mockTrip,
        premiumUnlockedAt: new Date(),
      } as any);

      const summary = await service.getCheckoutSummary('user-1', mockTrip.id);
      expect(summary.alreadyUnlocked).toBe(true);
    });
  });

  describe('Process Checkout Purchase API (Phase K2B)', () => {
    it('should process PIX checkout and return QR code details while keeping trip premiumUnlockedAt null', async () => {
      process.env.PAYMENT_PROVIDER = 'mercadopago';
      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(null);

      const res = await service.processCheckoutPurchase('user-1', {
        tripId: mockTrip.id,
        paymentMethod: PaymentMethodType.PIX,
      });

      expect(res.paymentMethod).toBe('PIX');
      expect(res.status).toBe(PurchaseStatus.PENDING);
      expect(res.amount).toBe(19.99);
      expect(res.pixDetails).toBeDefined();
      expect(res.pixDetails?.copyPaste).toContain('br.gov.bcb.pix');
      // Verify trip unlock was NOT called on PIX creation (must wait for K3 webhook!)
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('should process CARD checkout with cardToken and keep premiumUnlockedAt null until K3 webhook confirmation', async () => {
      process.env.PAYMENT_PROVIDER = 'mercadopago';
      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(null);

      const res = await service.processCheckoutPurchase('user-1', {
        tripId: mockTrip.id,
        paymentMethod: PaymentMethodType.CARD,
        cardToken: 'mock-card-token-xyz',
      });

      expect(res.paymentMethod).toBe('CARD');
      expect(res.amount).toBe(19.99);
      // Premium entitlement remains locked until K3 webhook
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('should reject checkout request for trip belonging to another user', async () => {
      await expect(
        service.processCheckoutPurchase('user-other-99', {
          tripId: mockTrip.id,
          paymentMethod: PaymentMethodType.PIX,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject checkout request if trip is already premium unlocked', async () => {
      jest.spyOn(prisma.trip, 'findUnique').mockResolvedValue({
        ...mockTrip,
        premiumUnlockedAt: new Date(),
      } as any);

      await expect(
        service.processCheckoutPurchase('user-1', {
          tripId: mockTrip.id,
          paymentMethod: PaymentMethodType.PIX,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reuse existing PENDING purchase when checking out again for the same trip', async () => {
      const existingPending = {
        id: 'pur-pending-reuse-100',
        userId: 'user-1',
        productId: mockProduct.id,
        tripId: mockTrip.id,
        status: PurchaseStatus.PENDING,
        amount: mockProduct.price,
        finalAmount: mockProduct.price,
        currency: 'BRL',
      };
      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(existingPending as any);

      const res = await service.processCheckoutPurchase('user-1', {
        tripId: mockTrip.id,
        paymentMethod: PaymentMethodType.PIX,
      });

      expect(res.purchaseId).toBe('pur-pending-reuse-100');
    });
  });

  describe('Mock Safety & Provider Resolution', () => {
    it('should resolve MercadoPagoPaymentProvider when PAYMENT_PROVIDER=mercadopago', () => {
      process.env.PAYMENT_PROVIDER = 'mercadopago';
      const provider = service.resolvePaymentProvider();
      expect(provider).toBeInstanceOf(MercadoPagoPaymentProvider);
    });

    it('should throw ForbiddenException in production if PAYMENT_PROVIDER is missing or mock', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.PAYMENT_PROVIDER;

      expect(() => service.resolvePaymentProvider()).toThrow(ForbiddenException);
    });
  });
});
