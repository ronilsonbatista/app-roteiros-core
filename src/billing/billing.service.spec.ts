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
  InternalServerErrorException,
} from '@nestjs/common';
import { ProductType, PurchaseStatus, Prisma } from '@prisma/client';

describe('BillingService (Phase K3.1 Payment Lifecycle & Webhook Identity)', () => {
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

  const mockPurchase = {
    id: 'pur-100',
    userId: 'user-1',
    productId: mockProduct.id,
    tripId: mockTrip.id,
    status: PurchaseStatus.PENDING,
    amount: new Prisma.Decimal('19.99'),
    finalAmount: new Prisma.Decimal('19.99'),
    currency: 'BRL',
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
                  status: data.status || PurchaseStatus.PENDING,
                  paidAt: data.paidAt,
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

  describe('Webhook Identity & Same Payment Different Events (Phase K3.1)', () => {
    it('should process event A (pending) and event B (approved) for the SAME payment_123', async () => {
      // Event A: pending
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'PENDING',
        providerPaymentId: 'payment_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
      });

      const resA = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req-evt-A' },
        { id: 'evt-A-101', action: 'payment.created', data: { id: 'payment_123' } },
      );
      expect(resA.purchaseStatus).toBe('PENDING');

      // Event B: approved
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'PAID',
        providerPaymentId: 'payment_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
        paidAt: new Date(),
      });

      const resB = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req-evt-B' },
        { id: 'evt-B-102', action: 'payment.updated', data: { id: 'payment_123' } },
      );
      expect(resB.purchaseStatus).toBe('PAID');
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTrip.id },
        data: { premiumUnlockedAt: expect.any(Date) },
      });
    });

    it('should handle provider downtime safely by recording RETRYABLE state and throwing error for Mercado Pago retry', async () => {
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockRejectedValue(
        new Error('503 Service Unavailable'),
      );

      await expect(
        service.handleMercadoPagoWebhook(
          { 'x-signature': 'test-valid-signature' },
          { id: 'evt-down-1', data: { id: 'payment_123' } },
        ),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prisma.webhookEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'RETRYABLE' }),
        }),
      );
    });

    it('should prevent state regression (PAID -> PENDING) when delayed out-of-order pending notification arrives', async () => {
      const paidPurchase = { ...mockPurchase, status: PurchaseStatus.PAID };
      jest.spyOn(prisma.purchase, 'findUnique').mockResolvedValue(paidPurchase as any);

      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValue({
        success: true,
        status: 'PENDING',
        providerPaymentId: 'payment_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
      });

      const res = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature' },
        { id: 'evt-delayed-pending', data: { id: 'payment_123' } },
      );

      expect(res.purchaseStatus).toBe('PAID');
    });

    it('should prevent double charge if user tries to switch to CARD while PIX is actively pending', async () => {
      process.env.PAYMENT_PROVIDER = 'mercadopago';
      const activePixPurchase = {
        ...mockPurchase,
        providerPaymentId: 'pix_active_123',
        paymentMethod: 'PIX',
      };
      jest.spyOn(prisma.purchase, 'findFirst').mockResolvedValue(activePixPurchase as any);
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValue({
        success: true,
        status: 'PENDING',
        providerPaymentId: 'pix_active_123',
      });

      await expect(
        service.processCheckoutPurchase('user-1', {
          tripId: mockTrip.id,
          paymentMethod: PaymentMethodType.CARD,
          cardToken: 'tok-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
