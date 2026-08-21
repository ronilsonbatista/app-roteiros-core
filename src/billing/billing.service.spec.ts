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

describe('BillingService (Phase K3.2 Final Payment Safety & Webhook Identity)', () => {
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
              findUnique: jest.fn().mockResolvedValue(mockProduct),
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
                  refundedAt: data.refundedAt,
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

  describe('Strict Notification Identity & Same Notification Retry (Phase K3.2)', () => {
    it('should deduplicate retry of the SAME notificationId=evt_100 even with different x-request-id headers', async () => {
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'PAID',
        providerPaymentId: 'pay_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
        paidAt: new Date(),
      });

      // Delivery 1: x-request-id = req_A
      const res1 = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req_A' },
        { id: 'evt_100', action: 'payment.updated', data: { id: 'pay_123' } },
      );
      expect(res1.purchaseStatus).toBe('PAID');

      // Mock that webhookEvent findUnique now finds existing PROCESSED event
      jest.spyOn(prisma.webhookEvent, 'findUnique').mockResolvedValueOnce({
        id: 'w1',
        provider: 'MERCADOPAGO',
        providerEventId: 'mp_evt_evt_100',
        eventType: 'payment.updated',
        purchaseId: mockPurchase.id,
        status: 'PROCESSED',
        errorMessage: null,
        processedAt: new Date(),
        createdAt: new Date(),
      });

      // Delivery 2 (Retry): x-request-id = req_B (different header, same notification body.id)
      const res2 = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req_B' },
        { id: 'evt_100', action: 'payment.updated', data: { id: 'pay_123' } },
      );
      expect(res2.message).toContain('Evento já processado (duplicado)');
    });

    it('should process TWO DIFFERENT notifications (evt_100 pending, evt_101 approved) for the SAME payment pay_123', async () => {
      // Event 1: evt_100 (pending)
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'PENDING',
        providerPaymentId: 'pay_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
      });

      const res1 = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req_1' },
        { id: 'evt_100', action: 'payment.created', data: { id: 'pay_123' } },
      );
      expect(res1.purchaseStatus).toBe('PENDING');

      // Event 2: evt_101 (approved)
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'PAID',
        providerPaymentId: 'pay_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
        paidAt: new Date(),
      });

      const res2 = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature', 'x-request-id': 'req_2' },
        { id: 'evt_101', action: 'payment.updated', data: { id: 'pay_123' } },
      );
      expect(res2.purchaseStatus).toBe('PAID');
    });

    it('should update Purchase status to REFUNDED when provider notifies refund/chargeback', async () => {
      jest.spyOn(mercadoPagoProvider, 'getPaymentStatus').mockResolvedValueOnce({
        success: true,
        status: 'REFUNDED',
        providerPaymentId: 'pay_123',
        purchaseId: mockPurchase.id,
        amount: 19.99,
        currency: 'BRL',
      });

      const res = await service.handleMercadoPagoWebhook(
        { 'x-signature': 'test-valid-signature' },
        { id: 'evt_ref_1', action: 'payment.updated', data: { id: 'pay_123' } },
      );

      expect(res.purchaseStatus).toBe('REFUNDED');
      expect(prisma.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PurchaseStatus.REFUNDED }),
        }),
      );
    });
  });
});
