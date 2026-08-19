import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
import { PurchaseStatus, ProductType } from '@prisma/client';

@Injectable()
export class BillingService {
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

    const provider = this.resolvePaymentProvider();

    const paymentResult = await provider.processPayment({
      userId,
      purchaseId: purchase.id,
      amount: Number(purchase.finalAmount),
      currency: purchase.currency,
      description: `2GO - ${product.name}`,
      paymentMethod: dto.paymentMethod,
      cardToken: dto.cardToken,
      installments: dto.installments,
      idempotencyKey,
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
