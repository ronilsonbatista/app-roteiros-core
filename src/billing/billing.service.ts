import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateMockPurchaseDto,
} from './dto/billing.dto';
import { PurchaseStatus, ProductType } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProvider: MockPaymentProvider,
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
    const paymentResult = await this.paymentProvider.processPayment({
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
