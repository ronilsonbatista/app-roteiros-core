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

describe('BillingService (Phase K3 Mercado Pago Webhooks & Entitlement)', () => {
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

  describe('Webhook & Entitlement (Phase K3)', () => {
    it('should reject webhook if x-signature is missing or invalid', async () => {
      await expect(
        service.handleMercadoPagoWebhook(
          { 'x-signature': 'invalid-signature' },
          { data: { id: 'mp-123' } },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should process valid webhook, set Purchase status to PAID, and unlock Trip premiumUnlockedAt', async () => {
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValue({
        success: true,
        status: 'PAID',
        providerPaymentId: 'mp-999',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
        paidAt: new Date(),
      });

      const res = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature' },
        { id: 'evt-100', data: { id: 'mp-999' } },
      );

      expect(res.status).toBe('OK');
      expect(res.purchaseStatus).toBe('PAID');
      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTrip.id },
        data: { premiumUnlockedAt: expect.any(Date) },
      });
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('should return idempotent success no-op if webhookEvent already exists (replay attack protection)', async () => {
      jest.spyOn(prisma.webhookEvent, 'findUnique').mockResolvedValue({
        id: 'evt-existing',
        provider: 'MERCADOPAGO',
        providerEventId: 'evt-duplicate-1',
        eventType: 'payment.updated',
        status: 'PROCESSED',
        processedAt: new Date(),
        createdAt: new Date(),
        purchaseId: mockPurchase.id,
      });

      const res = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature' },
        { id: 'evt-duplicate-1', data: { id: 'mp-999' } },
      );

      expect(res.message).toContain('Evento já processado');
      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('should reject webhook if payment amount does not match Purchase finalAmount', async () => {
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValue({
        success: true,
        status: 'PAID',
        providerPaymentId: 'mp-999',
        purchaseId: mockPurchase.id,
        amount: 5.0, // Fraudulent lower amount!
        currency: 'BRL',
      });

      await expect(
        service.handleMercadoPagoWebhook(
          { 'x-signature': 'test-valid-signature' },
          { id: 'evt-fraud-1', data: { id: 'mp-999' } },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });

  describe('Checkout Summary & Purchase Status APIs', () => {
    it('should return purchase status for authenticated owner', async () => {
      const statusRes = await service.getPurchaseStatus('user-1', mockPurchase.id);
      expect(statusRes.purchaseId).toBe(mockPurchase.id);
      expect(statusRes.status).toBe(PurchaseStatus.PENDING);
    });

    it('should reject purchase status query if requested by another user', async () => {
      await expect(
        service.getPurchaseStatus('user-other-99', mockPurchase.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
