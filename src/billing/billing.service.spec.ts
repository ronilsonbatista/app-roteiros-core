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
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ProductType, PurchaseStatus, DiscountType, Prisma } from '@prisma/client';

describe('BillingService (Phase K4 Coupons & Pricing Snapshots)', () => {
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
    price: new Prisma.Decimal('100.00'),
    currency: 'BRL',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCouponPercentage = {
    id: 'coup-10',
    code: 'WALL10',
    discountType: DiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal('10.00'),
    active: true,
    productType: ProductType.ITINERARY_FULL_ACCESS,
    startsAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCouponFixed = {
    id: 'coup-20',
    code: 'WALL20',
    discountType: DiscountType.FIXED,
    discountValue: new Prisma.Decimal('20.00'),
    active: true,
    productType: ProductType.ITINERARY_FULL_ACCESS,
    startsAt: null,
    expiresAt: null,
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

  const mockPurchase = {
    id: 'pur-100',
    userId: 'user-1',
    productId: mockProduct.id,
    couponId: mockCouponPercentage.id,
    tripId: mockTrip.id,
    status: PurchaseStatus.PENDING,
    amount: new Prisma.Decimal('90.00'),
    originalAmount: new Prisma.Decimal('100.00'),
    discountAmount: new Prisma.Decimal('10.00'),
    finalAmount: new Prisma.Decimal('90.00'),
    currency: 'BRL',
    paymentMethod: 'PIX',
    product: mockProduct,
    trip: mockTrip,
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
              findUnique: jest.fn().mockResolvedValue(mockProduct),
              create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'prod-new', ...data })),
              update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
            },
            coupon: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.code === 'WALL10') return Promise.resolve(mockCouponPercentage);
                if (where.code === 'WALL20') return Promise.resolve(mockCouponFixed);
                if (where.id === 'coup-10') return Promise.resolve(mockCouponPercentage);
                return Promise.resolve(null);
              }),
              findMany: jest.fn().mockResolvedValue([mockCouponPercentage, mockCouponFixed]),
              create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'coup-new', ...data })),
              update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
            },
            trip: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === mockTrip.id) return Promise.resolve(mockTrip);
                return Promise.resolve(null);
              }),
              update: jest.fn().mockResolvedValue({ ...mockTrip, premiumUnlockedAt: new Date() }),
            },
            guestJourney: {
              findFirst: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({}),
            },
            webhookEvent: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'evt-1', ...data })),
              upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ id: 'evt-1', ...create })),
            },
            purchase: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.id === mockPurchase.id) return Promise.resolve(mockPurchase);
                return Promise.resolve(null);
              }),
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
                  ...mockPurchase,
                  id: where.id,
                  ...data,
                });
              }),
              count: jest.fn().mockResolvedValue(1),
              findMany: jest.fn().mockResolvedValue([mockPurchase]),
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

  describe('Coupon Calculations & Code Normalization (Phase K4)', () => {
    it('should calculate 10% percentage discount correctly with Decimal precision', async () => {
      const calc = await service.validateAndCalculateCoupon(
        'wall10', // lowercase input
        new Prisma.Decimal('100.00'),
        ProductType.ITINERARY_FULL_ACCESS,
      );

      expect(calc.coupon?.code).toBe('WALL10');
      expect(calc.discountAmount.toString()).toBe('10');
      expect(calc.finalAmount.toString()).toBe('90');
    });

    it('should calculate fixed discount correctly', async () => {
      const calc = await service.validateAndCalculateCoupon(
        'WALL20',
        new Prisma.Decimal('100.00'),
        ProductType.ITINERARY_FULL_ACCESS,
      );

      expect(calc.discountAmount.toString()).toBe('20');
      expect(calc.finalAmount.toString()).toBe('80');
    });

    it('should throw BadRequestException if coupon code is invalid', async () => {
      await expect(
        service.validateAndCalculateCoupon(
          'INVALID_CODE',
          new Prisma.Decimal('100.00'),
          ProductType.ITINERARY_FULL_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if discount results in zero final amount in V1', async () => {
      const mockCoupon100 = {
        ...mockCouponPercentage,
        discountValue: new Prisma.Decimal('100.00'),
      };
      jest.spyOn(prisma.coupon, 'findUnique').mockResolvedValue(mockCoupon100 as any);

      await expect(
        service.validateAndCalculateCoupon(
          'WALL10',
          new Prisma.Decimal('100.00'),
          ProductType.ITINERARY_FULL_ACCESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Checkout Quote Endpoint', () => {
    it('should return calculated quote for trip with coupon applied', async () => {
      const quote = await service.getCheckoutQuote('user-1', mockTrip.id, {
        couponCode: 'wall10',
      });

      expect(quote.tripId).toBe(mockTrip.id);
      expect(quote.pricing.originalAmount).toBe(100);
      expect(quote.pricing.discountAmount).toBe(10);
      expect(quote.pricing.finalAmount).toBe(90);
      expect(quote.coupon?.code).toBe('WALL10');
      expect(quote.coupon?.applied).toBe(true);
    });
  });

  describe('Idempotency & Revalidation on Purchase Checkout', () => {
    it('should throw ConflictException if idempotency key is reused with different parameters', async () => {
      const existingPurchaseKey = {
        ...mockPurchase,
        idempotencyKey: 'idemp-key-xyz',
        tripId: 'trip-999', // Different trip!
        paymentMethod: 'PIX',
      };
      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(existingPurchaseKey as any);

      await expect(
        service.processCheckoutPurchase(
          'user-1',
          { tripId: mockTrip.id, paymentMethod: PaymentMethodType.PIX },
          'idemp-key-xyz',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Admin Coupon & Product Management', () => {
    it('should create coupon normalized to uppercase code', async () => {
      const res = await service.createCoupon({
        code: 'promo15',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
      });

      expect(prisma.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'PROMO15' }),
        }),
      );
    });

    it('should deactivate coupon successfully', async () => {
      await service.deactivateCoupon('coup-10');
      expect(prisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coup-10' },
        data: { active: false },
      });
    });
  });
});
