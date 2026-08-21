import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { MercadoPagoPaymentProvider } from './providers/mercadopago-payment.provider';
import { PaymentProvider } from './providers/payment-provider.interface';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateMockPurchaseDto,
  CheckoutPurchaseDto,
  CheckoutSummaryDto,
  CheckoutResponseDto,
} from './dto/billing.dto';
import { PurchaseStatus, ProductType, GuestJourneyStatus } from '@prisma/client';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly mercadoPagoProvider: MercadoPagoPaymentProvider,
  ) {}

  public isMockPaymentEnabled(): boolean {
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    if (env === 'production' || env === 'staging') {
      return false;
    }
    const flag = (process.env.BILLING_MOCK_PAYMENTS_ENABLED || '').toLowerCase();
    if (env === 'test') {
      return flag !== 'false';
    }
    return flag === 'true';
  }

  private checkMockEnabled() {
    if (!this.isMockPaymentEnabled()) {
      throw new ForbiddenException(
        'Mock payments are disabled in this environment',
      );
    }
  }

  public resolvePaymentProvider(): PaymentProvider {
    const providerName = (process.env.PAYMENT_PROVIDER || '').toLowerCase();
    const env = (process.env.NODE_ENV || 'development').toLowerCase();

    if (providerName === 'mercadopago') {
      return this.mercadoPagoProvider;
    }

    if (providerName === 'mock' || this.isMockPaymentEnabled()) {
      return this.mockProvider;
    }

    if (env === 'production' || env === 'staging') {
      throw new ForbiddenException(
        'Invalid or unconfigured PAYMENT_PROVIDER in production/staging environment',
      );
    }

    return this.mockProvider;
  }

  // CHECKOUT SUMMARY & REAL PURCHASE API
  async getCheckoutSummary(userId: string, tripId: string): Promise<CheckoutSummaryDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId) {
      throw new ForbiddenException('Não autorizado. A viagem pertence a outro usuário.');
    }

    const alreadyUnlocked = trip.premiumUnlockedAt != null;

    const product = await this.prisma.product.findFirst({
      where: { type: ProductType.ITINERARY_FULL_ACCESS, active: true },
    });
    if (!product) throw new NotFoundException('Produto de acesso completo ao roteiro não encontrado');

    const existingPurchase = await this.prisma.purchase.findFirst({
      where: { userId, tripId, productId: product.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tripId,
      alreadyUnlocked,
      product: {
        id: product.id,
        type: product.type,
        name: product.name,
        description: product.description || undefined,
      },
      pricing: {
        originalAmount: Number(product.price),
        discountAmount: 0,
        finalAmount: Number(product.price),
        currency: product.currency,
      },
      existingPurchaseId: existingPurchase?.id,
      existingPurchaseStatus: existingPurchase?.status,
      supportedPaymentMethods: ['PIX', 'CARD'],
    };
  }

  async processCheckoutPurchase(
    userId: string,
    dto: CheckoutPurchaseDto,
    idempotencyKey?: string,
    userEmail?: string,
  ): Promise<CheckoutResponseDto> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
    });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId) {
      throw new ForbiddenException('Não autorizado. A viagem pertence a outro usuário.');
    }

    if (trip.premiumUnlockedAt != null) {
      throw new BadRequestException('Esta viagem já possui acesso premium liberado.');
    }

    const product = await this.prisma.product.findFirst({
      where: { type: ProductType.ITINERARY_FULL_ACCESS, active: true },
    });
    if (!product) throw new NotFoundException('Produto de acesso completo ao roteiro não encontrado');

    // Idempotency key check
    if (idempotencyKey) {
      const existingKeyPurchase = await this.prisma.purchase.findUnique({
        where: { idempotencyKey },
      });
      if (existingKeyPurchase) {
        if (existingKeyPurchase.userId !== userId) {
          throw new ForbiddenException('Chave de idempotência pertence a outro usuário');
        }
        return {
          purchaseId: existingKeyPurchase.id,
          status: existingKeyPurchase.status,
          amount: Number(existingKeyPurchase.finalAmount),
          currency: existingKeyPurchase.currency,
          paymentMethod: existingKeyPurchase.paymentMethod || dto.paymentMethod,
        };
      }
    }

    // Reuse existing PENDING purchase or create new
    let purchase = await this.prisma.purchase.findFirst({
      where: {
        userId,
        tripId: dto.tripId,
        productId: product.id,
        status: PurchaseStatus.PENDING,
      },
    });

    const provider = this.resolvePaymentProvider();

    // Active Charge Prevention: Check if existing purchase has an active pending payment
    if (purchase && purchase.providerPaymentId && provider.getPaymentStatus) {
      try {
        const currentStatus = await provider.getPaymentStatus(purchase.providerPaymentId);
        if (currentStatus.status === 'PENDING') {
          if (dto.paymentMethod === purchase.paymentMethod) {
            // Same payment method: return existing active charge
            return {
              purchaseId: purchase.id,
              status: purchase.status,
              amount: Number(purchase.finalAmount),
              currency: purchase.currency,
              paymentMethod: dto.paymentMethod,
            };
          } else {
            // User tries to switch payment method while previous is still active
            throw new BadRequestException(
              'Existe uma cobrança ativa pendente. Conclua a cobrança existente ou aguarde a expiração.',
            );
          }
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Não foi possível verificar status do pagamento anterior: ${err.message}`);
      }
    }

    if (!purchase) {
      purchase = await this.prisma.purchase.create({
        data: {
          userId,
          productId: product.id,
          tripId: dto.tripId,
          status: PurchaseStatus.PENDING,
          amount: product.price,
          originalAmount: product.price,
          discountAmount: 0,
          finalAmount: product.price,
          currency: product.currency,
          idempotencyKey,
        },
      });
    }

    const providerIdempotencyKey = idempotencyKey || purchase.idempotencyKey || `pur_idemp_${purchase.id}`;

    const paymentResult = await provider.processPayment({
      userId,
      purchaseId: purchase.id,
      amount: Number(purchase.finalAmount),
      currency: purchase.currency,
      description: `2GO - ${product.name}`,
      paymentMethod: dto.paymentMethod,
      cardToken: dto.cardToken,
      installments: dto.installments,
      idempotencyKey: providerIdempotencyKey,
      payerEmail: userEmail,
    });

    if (!paymentResult.success && paymentResult.status === 'REJECTED') {
      throw new BadRequestException(
        paymentResult.error || 'Pagamento recusado pelo provedor de pagamento',
      );
    }

    const providerName =
      provider instanceof MercadoPagoPaymentProvider ? 'MERCADOPAGO' : 'MOCK';

    const updatedPurchase = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        provider: providerName,
        providerPaymentId: paymentResult.providerPaymentId,
        paymentMethod: dto.paymentMethod,
        mockPaymentId: paymentResult.transactionId || paymentResult.providerPaymentId,
      },
    });

    return {
      purchaseId: updatedPurchase.id,
      status: updatedPurchase.status,
      amount: Number(updatedPurchase.finalAmount),
      currency: updatedPurchase.currency,
      paymentMethod: dto.paymentMethod,
      pixDetails: paymentResult.pixDetails
        ? {
            copyPaste: paymentResult.pixDetails.copyPaste,
            qrCodeBase64: paymentResult.pixDetails.qrCodeBase64,
            expiresAt: paymentResult.pixDetails.expiresAt
              ? String(paymentResult.pixDetails.expiresAt)
              : undefined,
            ticketUrl: paymentResult.pixDetails.ticketUrl,
          }
        : undefined,
    };
  }

  // WEBHOOK HANDLING (PHASE K3 & K3.1 & K3.2 HARDENED)
  async handleMercadoPagoWebhook(headers: Record<string, string>, body: any) {
    const xSignature = headers['x-signature'] || headers['X-Signature'];
    const xRequestId = headers['x-request-id'] || headers['X-Request-Id'];

    const dataId =
      body?.data?.id != null
        ? String(body.data.id)
        : body?.id != null
        ? String(body.id)
        : typeof body?.resource === 'string'
        ? body.resource.split('/').pop()
        : undefined;

    const isValidSignature = this.mercadoPagoProvider.verifyWebhookSignature(
      xSignature,
      xRequestId,
      dataId ? String(dataId) : undefined,
    );

    if (!isValidSignature) {
      throw new ForbiddenException('Assinatura do webhook inválida ou ausente');
    }

    // Strict notificationId identity from body.id
    const notificationId = body?.id != null ? String(body.id) : undefined;
    const eventId = notificationId
      ? `mp_evt_${notificationId}`
      : dataId
      ? `mp_pay_${dataId}`
      : undefined;

    if (!eventId) {
      throw new BadRequestException('Notificação inválida: ID de notificação ausente');
    }

    // Deduplication check (Idempotency) via compound unique constraint
    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
        },
      },
    });

    if (existingEvent && existingEvent.status === 'PROCESSED') {
      return { status: 'OK', message: 'Evento já processado (duplicado)' };
    }

    if (!dataId) {
      // Event received without data.id (e.g. ping test)
      await this.prisma.webhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'MERCADOPAGO',
            providerEventId: eventId,
          },
        },
        create: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
          eventType: body?.type || body?.action || 'ping',
          status: 'PROCESSED',
        },
        update: {
          status: 'PROCESSED',
        },
      });
      return { status: 'OK', message: 'Ping recebido' };
    }

    // Reconcile payment status via server-to-server API call with Provider Down resilience
    let paymentResult;
    try {
      paymentResult = await this.mercadoPagoProvider.getPaymentStatus(String(dataId));
    } catch (err: any) {
      this.logger.error(`Provedor temporariamente indisponível ao verificar payment ${dataId}: ${err.message}`);
      await this.prisma.webhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'MERCADOPAGO',
            providerEventId: eventId,
          },
        },
        create: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
          eventType: body?.type || body?.action || 'payment.updated',
          status: 'RETRYABLE',
          errorMessage: err.message,
        },
        update: {
          status: 'RETRYABLE',
          errorMessage: err.message,
        },
      });
      throw new InternalServerErrorException(
        'Provedor de pagamento temporariamente indisponível. Notificação será reprocessada.',
      );
    }

    if (!paymentResult || !paymentResult.purchaseId) {
      const purchaseByPaymentId = await this.prisma.purchase.findFirst({
        where: { providerPaymentId: String(dataId) },
      });
      if (purchaseByPaymentId) {
        paymentResult.purchaseId = purchaseByPaymentId.id;
      } else {
        throw new NotFoundException(`Compra não encontrada para a notificação dataId=${dataId}`);
      }
    }

    const purchase = await this.prisma.purchase.findUnique({
      where: { id: paymentResult.purchaseId },
      include: { product: true, trip: true },
    });

    if (!purchase) {
      throw new NotFoundException(`Compra ${paymentResult.purchaseId} não encontrada`);
    }

    // Amount & Currency Validation
    if (
      paymentResult.amount != null &&
      Math.abs(Number(paymentResult.amount) - Number(purchase.finalAmount)) > 0.01
    ) {
      await this.prisma.webhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'MERCADOPAGO',
            providerEventId: eventId,
          },
        },
        create: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
          eventType: body?.type || 'payment.updated',
          purchaseId: purchase.id,
          status: 'FAILED',
          errorMessage: 'Divergência de valor',
        },
        update: { status: 'FAILED', errorMessage: 'Divergência de valor' },
      });
      throw new BadRequestException('Valor do pagamento divergente do valor da compra');
    }

    if (paymentResult.currency && paymentResult.currency !== purchase.currency) {
      await this.prisma.webhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'MERCADOPAGO',
            providerEventId: eventId,
          },
        },
        create: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
          eventType: body?.type || 'payment.updated',
          purchaseId: purchase.id,
          status: 'FAILED',
          errorMessage: 'Divergência de moeda',
        },
        update: { status: 'FAILED', errorMessage: 'Divergência de moeda' },
      });
      throw new BadRequestException('Moeda do pagamento divergente da moeda da compra');
    }

    // Atomic Entitlement & State Machine Transaction
    return this.prisma.$transaction(async (tx) => {
      await tx.webhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: 'MERCADOPAGO',
            providerEventId: eventId,
          },
        },
        create: {
          provider: 'MERCADOPAGO',
          providerEventId: eventId,
          eventType: body?.type || body?.action || 'payment.updated',
          purchaseId: purchase.id,
          status: 'PROCESSED',
        },
        update: {
          status: 'PROCESSED',
        },
      });

      if (paymentResult.status === 'PAID') {
        const paidAt = paymentResult.paidAt || new Date();

        const updatedPurchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: PurchaseStatus.PAID,
            paidAt,
            providerPaymentId: String(dataId),
            provider: 'MERCADOPAGO',
          },
        });

        if (
          purchase.product.type === ProductType.ITINERARY_FULL_ACCESS &&
          purchase.tripId
        ) {
          await tx.trip.update({
            where: { id: purchase.tripId },
            data: { premiumUnlockedAt: paidAt },
          });

          const linkedGuestJourney = await tx.guestJourney.findFirst({
            where: { createdTripId: purchase.tripId },
          });
          if (linkedGuestJourney) {
            await tx.guestJourney.update({
              where: { id: linkedGuestJourney.id },
              data: { status: GuestJourneyStatus.PAID },
            });
          }
        }

        return { status: 'OK', purchaseStatus: 'PAID', purchaseId: updatedPurchase.id };
      } else if (paymentResult.status === 'REFUNDED') {
        // Financial status update to REFUNDED. Handles both refund and chargeback.
        // ENTITLEMENT_ORIGIN_GAP: automatic revocation of Trip.premiumUnlockedAt is deferred to preserve manual admin overrides.
        this.logger.warn(`[FINANCIAL_ALERT] Purchase ${purchase.id} foi alterada para REFUNDED/CHARGEBACK`);
        const updatedPurchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: PurchaseStatus.REFUNDED,
            refundedAt: new Date(),
          },
        });
        return { status: 'OK', purchaseStatus: 'REFUNDED', purchaseId: updatedPurchase.id };
      } else {
        // State Monotonicity: Do not regress a PAID purchase back to PENDING from a delayed out-of-order notification!
        if (purchase.status === PurchaseStatus.PAID) {
          return { status: 'OK', purchaseStatus: 'PAID', purchaseId: purchase.id };
        }
        return { status: 'OK', purchaseStatus: purchase.status, purchaseId: purchase.id };
      }
    });
  }

  async getPurchaseStatus(userId: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { trip: { select: { id: true, premiumUnlockedAt: true } } },
    });

    if (!purchase) throw new NotFoundException('Compra não encontrada');
    if (purchase.userId !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    return {
      purchaseId: purchase.id,
      status: purchase.status,
      paidAt: purchase.paidAt,
      premiumUnlocked: purchase.trip?.premiumUnlockedAt != null,
    };
  }

  // USER
  async getActiveProducts() {
    return this.prisma.product.findMany({ where: { active: true } });
  }

  async createMockPurchase(userId: string, dto: CreateMockPurchaseDto) {
    this.checkMockEnabled();

    // Idempotency key check
    if (dto.idempotencyKey) {
      const existingKeyPurchase = await this.prisma.purchase.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existingKeyPurchase) {
        if (existingKeyPurchase.userId !== userId) {
          throw new ForbiddenException('Chave de idempotência pertence a outro usuário');
        }
        return existingKeyPurchase;
      }
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (!product.active) throw new BadRequestException('Produto inativo');

    if (dto.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
      });
      if (!trip) throw new NotFoundException('Trip não encontrada');
      if (trip.userId !== userId)
        throw new ForbiddenException(
          'Não autorizado. Você só pode comprar para a sua própria viagem.',
        );

      if (
        product.type === ProductType.ITINERARY_FULL_ACCESS &&
        trip.premiumUnlockedAt != null
      ) {
        throw new BadRequestException(
          'Esta viagem já possui acesso premium liberado.',
        );
      }

      // Reuse existing PENDING purchase for same user, trip, and product to avoid duplicates
      const existingPending = await this.prisma.purchase.findFirst({
        where: {
          userId,
          tripId: dto.tripId,
          productId: product.id,
          status: PurchaseStatus.PENDING,
        },
      });
      if (existingPending) {
        return existingPending;
      }
    }

    return this.prisma.purchase.create({
      data: {
        userId,
        productId: product.id,
        tripId: dto.tripId,
        status: PurchaseStatus.PENDING,
        amount: product.price,
        originalAmount: product.price,
        discountAmount: 0,
        finalAmount: product.price,
        currency: product.currency,
        idempotencyKey: dto.idempotencyKey,
      },
    });
  }

  async confirmMockPayment(userId: string, purchaseId: string) {
    this.checkMockEnabled();

    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { product: true },
    });

    if (!purchase) throw new NotFoundException('Compra não encontrada');
    if (purchase.userId !== userId)
      throw new ForbiddenException('Acesso negado');

    if (purchase.status === PurchaseStatus.PAID) {
      return purchase;
    }

    if (purchase.status !== PurchaseStatus.PENDING)
      throw new BadRequestException('A compra não está mais pendente');

    // Chamar MockPaymentProvider
    const paymentResult = await this.mockProvider.processPayment({
      userId,
      amount: Number(purchase.amount),
      currency: purchase.currency,
    });

    if (!paymentResult.success) {
      throw new BadRequestException('Falha no processamento do pagamento');
    }

    return this.confirmPaidPurchase(
      purchaseId,
      paymentResult.transactionId,
      'MOCK',
      'MOCK',
    );
  }

  /**
   * Reusable atomic method for payment confirmation and entitlement unlock.
   */
  async confirmPaidPurchase(
    purchaseId: string,
    providerPaymentId?: string,
    provider: string = 'MOCK',
    paymentMethod: string = 'MOCK',
  ) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { product: true },
    });

    if (!purchase) throw new NotFoundException('Compra não encontrada');

    // Idempotent return if already paid
    if (purchase.status === PurchaseStatus.PAID) {
      return purchase;
    }

    if (purchase.status !== PurchaseStatus.PENDING) {
      throw new BadRequestException('A compra não está mais pendente');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedPurchase = await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          status: PurchaseStatus.PAID,
          paidAt: new Date(),
          mockPaymentId: providerPaymentId,
          providerPaymentId: providerPaymentId,
          provider,
          paymentMethod,
        },
      });

      if (
        purchase.product.type === ProductType.ITINERARY_FULL_ACCESS &&
        purchase.tripId
      ) {
        await tx.trip.update({
          where: { id: purchase.tripId },
          data: { premiumUnlockedAt: new Date() },
        });

        // Update GuestJourney if linked
        const linkedGuestJourney = await tx.guestJourney.findFirst({
          where: { createdTripId: purchase.tripId },
        });
        if (linkedGuestJourney) {
          await tx.guestJourney.update({
            where: { id: linkedGuestJourney.id },
            data: { status: GuestJourneyStatus.PAID },
          });
        }
      }

      return updatedPurchase;
    });
  }

  async getUserPurchases(userId: string) {
    return this.prisma.purchase.findMany({
      where: { userId },
      include: { product: true, trip: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ADMIN
  async createProduct(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async getAdminProducts() {
    return this.prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async deactivateProduct(id: string) {
    return this.prisma.product.update({
      where: { id },
      data: { active: false },
    });
  }

  async getAdminPurchases(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.productId) where.productId = filters.productId;
    if (filters.tripId) where.tripId = filters.tripId;

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          product: { select: { id: true, name: true, type: true } },
          trip: { select: { id: true, title: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminPurchaseDetails(id: string) {
    const p = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        user: true,
        product: true,
        trip: true,
      },
    });
    if (!p) throw new NotFoundException('Compra não encontrada');
    return p;
  }
}
