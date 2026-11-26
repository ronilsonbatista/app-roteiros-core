import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
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
  CreateCouponDto,
  UpdateCouponDto,
  CreateMockPurchaseDto,
  CheckoutQuoteDto,
  CheckoutPurchaseDto,
  CheckoutSummaryDto,
  CheckoutQuoteResponseDto,
  CheckoutResponseDto,
  ValidateCouponDto,
  ValidateCouponResponseDto,
  CreateCardIntentDto,
  CardIntentResponseDto,
  ExpirePurchaseResponseDto,
  PaymentMethodType,
  PaymentMethodAvailabilityDto,
  PaymentMethodAvailabilityStatus,
} from './dto/billing.dto';
import {
  PurchaseStatus,
  ProductType,
  DiscountType,
  GuestJourneyStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  TripPricingQuote,
  resolveTripDayCount,
  resolveTripPricing,
} from './trip-pricing';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly mercadoPagoProvider: MercadoPagoPaymentProvider,
  ) {}

  /**
   * Canonical list price for ITINERARY_FULL_ACCESS from trip duration.
   * Never trusts client-supplied amounts.
   */
  public async resolveListPriceForTrip(trip: {
    id: string;
    startDate?: Date | null;
    endDate?: Date | null;
  }): Promise<TripPricingQuote> {
    const dayCount = await this.prisma.tripDay.count({
      where: { tripId: trip.id },
    });
    const days = resolveTripDayCount({
      dayCount,
      startDate: trip.startDate,
      endDate: trip.endDate,
    });
    return resolveTripPricing(days);
  }

  private pricingSnapshot(
    list: TripPricingQuote,
    discountAmount: Prisma.Decimal | number,
    finalAmount: Prisma.Decimal | number,
  ) {
    return {
      originalAmount: list.amount,
      discountAmount: Number(discountAmount),
      finalAmount: Number(finalAmount),
      currency: list.currency,
      amount: list.amount,
      days: list.days,
      tier: list.tier,
    };
  }

  public isMockPaymentEnabled(): boolean {
    const env = (process.env.NODE_ENV || 'development').toLowerCase();
    // Never allow mock payments in production.
    if (env === 'production') {
      return false;
    }
    const flag = (process.env.BILLING_MOCK_PAYMENTS_ENABLED || '').toLowerCase();
    // Staging: explicit opt-in only (safe TEST/mock confirmation path).
    if (env === 'staging') {
      return flag === 'true';
    }
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

  public normalizeCouponCode(code?: string): string | undefined {
    if (!code) return undefined;
    const trimmed = code.trim().toUpperCase();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /** PIX + CARD are chargeable today; wallets listed for Carrinho UI prep. */
  public getPaymentMethodAvailability(): PaymentMethodAvailabilityDto[] {
    const walletsEnabled =
      (process.env.WALLET_PAYMENTS_ENABLED || '').toLowerCase() === 'true';

    return [
      {
        method: PaymentMethodType.PIX,
        available: true,
        status: PaymentMethodAvailabilityStatus.AVAILABLE,
      },
      {
        method: PaymentMethodType.CARD,
        available: true,
        status: PaymentMethodAvailabilityStatus.AVAILABLE,
      },
      {
        method: PaymentMethodType.APPLE_PAY,
        available: walletsEnabled,
        status: walletsEnabled
          ? PaymentMethodAvailabilityStatus.AVAILABLE
          : PaymentMethodAvailabilityStatus.COMING_SOON,
        reason: walletsEnabled
          ? undefined
          : 'Apple Pay requer configuração manual (Merchant ID + Mercado Pago). Ver docs.',
      },
      {
        method: PaymentMethodType.GOOGLE_PAY,
        available: walletsEnabled,
        status: walletsEnabled
          ? PaymentMethodAvailabilityStatus.AVAILABLE
          : PaymentMethodAvailabilityStatus.COMING_SOON,
        reason: walletsEnabled
          ? undefined
          : 'Google Pay requer configuração manual (Merchant ID + Mercado Pago). Ver docs.',
      },
    ];
  }

  public getChargeablePaymentMethods(): string[] {
    return this.getPaymentMethodAvailability()
      .filter((m) => m.available)
      .map((m) => m.method);
  }

  private assertChargeablePaymentMethod(method: PaymentMethodType) {
    const availability = this.getPaymentMethodAvailability().find(
      (m) => m.method === method,
    );
    if (!availability?.available) {
      throw new BadRequestException(
        availability?.reason ||
          `Método de pagamento ${method} ainda não está disponível`,
      );
    }
  }

  public async validateAndCalculateCoupon(
    couponCode: string | undefined,
    originalPrice: Prisma.Decimal,
    productType: ProductType,
  ) {
    const normalizedCode = this.normalizeCouponCode(couponCode);
    if (!normalizedCode) {
      return {
        coupon: null,
        discountAmount: new Prisma.Decimal('0.00'),
        finalAmount: originalPrice,
      };
    }

    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizedCode },
    });

    if (!coupon) {
      throw new BadRequestException('Cupom inválido');
    }

    if (!coupon.active) {
      throw new BadRequestException('Cupom inativo');
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException('Cupom ainda não vigente');
    }

    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestException('Cupom expirado');
    }

    if (coupon.productType && coupon.productType !== productType) {
      throw new BadRequestException('Cupom não aplicável a este produto');
    }

    let discountAmount: Prisma.Decimal;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discountAmount = originalPrice
        .mul(coupon.discountValue)
        .div(new Prisma.Decimal(100))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    } else {
      discountAmount = coupon.discountValue;
    }

    // Ensure discount does not exceed original price
    if (discountAmount.gt(originalPrice)) {
      discountAmount = originalPrice;
    }

    const finalAmount = originalPrice.sub(discountAmount);

    if (finalAmount.lte(new Prisma.Decimal(0))) {
      throw new BadRequestException(
        'Cupons que resultam em valor zero não são suportados nesta versão',
      );
    }

    return {
      coupon,
      discountAmount,
      finalAmount,
    };
  }

  // CHECKOUT SUMMARY, QUOTE & REAL PURCHASE API
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

    const listPrice = await this.resolveListPriceForTrip(trip);

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
      pricing: this.pricingSnapshot(listPrice, 0, listPrice.amount),
      existingPurchaseId: existingPurchase?.id,
      existingPurchaseStatus: existingPurchase?.status,
      supportedPaymentMethods: this.getChargeablePaymentMethods(),
      paymentMethodAvailability: this.getPaymentMethodAvailability(),
    };
  }

  async getCheckoutQuote(
    userId: string,
    tripId: string,
    dto: CheckoutQuoteDto,
  ): Promise<CheckoutQuoteResponseDto> {
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

    const listPrice = await this.resolveListPriceForTrip(trip);
    const listDecimal = new Prisma.Decimal(listPrice.amountDecimal);
    const calc = await this.validateAndCalculateCoupon(
      dto.couponCode,
      listDecimal,
      product.type,
    );

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
      pricing: this.pricingSnapshot(
        listPrice,
        calc.discountAmount,
        calc.finalAmount,
      ),
      coupon: calc.coupon
        ? {
            code: calc.coupon.code,
            applied: true,
            discountType: calc.coupon.discountType,
            discountValue: Number(calc.coupon.discountValue),
          }
        : undefined,
      supportedPaymentMethods: this.getChargeablePaymentMethods(),
      paymentMethodAvailability: this.getPaymentMethodAvailability(),
      existingPurchaseId: existingPurchase?.id,
      existingPurchaseStatus: existingPurchase?.status,
    };
  }

  /**
   * Soft coupon validate for Carrinho (does not throw on invalid code).
   * List price always from Core duration rule — never client-supplied.
   */
  async validateCouponForTrip(
    userId: string,
    tripId: string,
    dto: ValidateCouponDto,
  ): Promise<ValidateCouponResponseDto> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId) {
      throw new ForbiddenException('Não autorizado. A viagem pertence a outro usuário.');
    }

    const product = await this.prisma.product.findFirst({
      where: { type: ProductType.ITINERARY_FULL_ACCESS, active: true },
    });
    if (!product) {
      throw new NotFoundException('Produto de acesso completo ao roteiro não encontrado');
    }

    const listPrice = await this.resolveListPriceForTrip(trip);
    const listDecimal = new Prisma.Decimal(listPrice.amountDecimal);

    try {
      const calc = await this.validateAndCalculateCoupon(
        dto.couponCode,
        listDecimal,
        product.type,
      );
      if (!calc.coupon) {
        return {
          valid: false,
          reason: 'Informe um código de cupom',
          pricing: this.pricingSnapshot(listPrice, 0, listPrice.amount),
        };
      }
      return {
        valid: true,
        code: calc.coupon.code,
        pricing: this.pricingSnapshot(
          listPrice,
          calc.discountAmount,
          calc.finalAmount,
        ),
        coupon: {
          code: calc.coupon.code,
          applied: true,
          discountType: calc.coupon.discountType,
          discountValue: Number(calc.coupon.discountValue),
        },
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        const response = err.getResponse();
        const message =
          typeof response === 'string'
            ? response
            : typeof response === 'object' &&
                response &&
                'message' in response
              ? Array.isArray((response as any).message)
                ? (response as any).message.join(', ')
                : String((response as any).message)
              : 'Cupom inválido';
        return {
          valid: false,
          code: this.normalizeCouponCode(dto.couponCode),
          reason: message,
          pricing: this.pricingSnapshot(listPrice, 0, listPrice.amount),
        };
      }
      throw err;
    }
  }

  /**
   * Card intent stub — returns a client-ready session without charging.
   * Real Brick / Card Form wiring needs MERCADO_PAGO_PUBLIC_KEY (Ronilson).
   */
  async createCardIntent(
    userId: string,
    dto: CreateCardIntentDto,
  ): Promise<CardIntentResponseDto> {
    const trip = await this.prisma.trip.findUnique({ where: { id: dto.tripId } });
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
    if (!product) {
      throw new NotFoundException('Produto de acesso completo ao roteiro não encontrado');
    }

    const listPrice = await this.resolveListPriceForTrip(trip);
    const calc = await this.validateAndCalculateCoupon(
      dto.couponCode,
      new Prisma.Decimal(listPrice.amountDecimal),
      product.type,
    );

    const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY || undefined;
    const intentId = `card_intent_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const amount = Number(calc.finalAmount);

    return {
      intentId,
      tripId: dto.tripId,
      status: publicKey ? 'REQUIRES_CONFIRMATION' : 'READY',
      publicKey,
      amount,
      currency: listPrice.currency,
      clientSecret: publicKey
        ? undefined
        : `stub_secret_${intentId}`,
      expiresAt,
      message: publicKey
        ? 'Use publicKey no Brick/Card Form; confirme com POST /purchases/checkout + cardToken.'
        : 'Stub sem MERCADO_PAGO_PUBLIC_KEY: use cardToken de teste no checkout (ex.: test-card-token).',
      pricing: this.pricingSnapshot(
        listPrice,
        calc.discountAmount,
        amount,
      ),
    };
  }

  /**
   * Expire a PENDING purchase (Pix abandon / TTL). Marks EXPIRED and asks provider to cancel.
   */
  async expirePurchase(
    userId: string,
    purchaseId: string,
  ): Promise<ExpirePurchaseResponseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada');
    if (purchase.userId !== userId) {
      throw new ForbiddenException('Não autorizado');
    }

    if (purchase.status === PurchaseStatus.EXPIRED) {
      return {
        purchaseId: purchase.id,
        status: purchase.status,
        expiredAt: purchase.expiredAt || undefined,
        message: 'Compra já estava expirada',
      };
    }

    if (purchase.status !== PurchaseStatus.PENDING) {
      throw new BadRequestException(
        `Não é possível expirar compra com status ${purchase.status}`,
      );
    }

    const provider = this.resolvePaymentProvider();
    if (purchase.providerPaymentId && provider.expirePayment) {
      try {
        await provider.expirePayment(purchase.providerPaymentId);
      } catch (err: any) {
        this.logger.warn(
          `Falha ao cancelar no provedor ao expirar ${purchaseId}: ${err.message}`,
        );
      }
    }

    const expiredAt = new Date();
    const updated = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: PurchaseStatus.EXPIRED,
        expiredAt,
      },
    });

    return {
      purchaseId: updated.id,
      status: updated.status,
      expiredAt: updated.expiredAt || expiredAt,
      message: 'Cobrança expirada. Pode iniciar um novo pagamento.',
    };
  }

  async processCheckoutPurchase(
    userId: string,
    dto: CheckoutPurchaseDto,
    idempotencyKey?: string,
    userEmail?: string,
  ): Promise<CheckoutResponseDto> {
    this.assertChargeablePaymentMethod(dto.paymentMethod);

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

    // Duration-based list price (canonical) + coupon revalidation at charge time
    const listPrice = await this.resolveListPriceForTrip(trip);
    const listDecimal = new Prisma.Decimal(listPrice.amountDecimal);
    const calc = await this.validateAndCalculateCoupon(
      dto.couponCode,
      listDecimal,
      product.type,
    );
    const provider = this.resolvePaymentProvider();

    const purchasePricing = (p: {
      originalAmount: Prisma.Decimal | number;
      discountAmount: Prisma.Decimal | number;
      finalAmount: Prisma.Decimal | number;
      currency: string;
    }) =>
      this.pricingSnapshot(listPrice, p.discountAmount, p.finalAmount);

    // Idempotency key check
    if (idempotencyKey) {
      const existingKeyPurchase = await this.prisma.purchase.findUnique({
        where: { idempotencyKey },
      });
      if (existingKeyPurchase) {
        if (existingKeyPurchase.userId !== userId) {
          throw new ForbiddenException('Chave de idempotência pertence a outro usuário');
        }
        if (
          existingKeyPurchase.tripId !== dto.tripId ||
          existingKeyPurchase.paymentMethod !== dto.paymentMethod
        ) {
          throw new ConflictException(
            'Conflito de idempotência: a chave foi utilizada com parâmetros diferentes',
          );
        }
        let existingPixDetails;
        if (existingKeyPurchase.paymentMethod === 'PIX' && existingKeyPurchase.providerPaymentId) {
          try {
            const currentStatus = await provider.getPaymentStatus?.(existingKeyPurchase.providerPaymentId);
            if (currentStatus?.pixDetails) {
              existingPixDetails = {
                copyPaste: currentStatus.pixDetails.copyPaste,
                qrCodeBase64: currentStatus.pixDetails.qrCodeBase64,
                expiresAt: currentStatus.pixDetails.expiresAt,
                ticketUrl: currentStatus.pixDetails.ticketUrl,
              };
            }
          } catch (_) {}
        }
        return {
          purchaseId: existingKeyPurchase.id,
          status: existingKeyPurchase.status,
          amount: Number(existingKeyPurchase.finalAmount),
          currency: existingKeyPurchase.currency,
          paymentMethod: existingKeyPurchase.paymentMethod || dto.paymentMethod,
          pixDetails: existingPixDetails,
          pricing: purchasePricing(existingKeyPurchase),
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

    // Active Charge Prevention: Check if existing purchase has an active pending payment
    if (purchase && purchase.providerPaymentId && provider.getPaymentStatus) {
      try {
        const currentStatus = await provider.getPaymentStatus(purchase.providerPaymentId);
        if (currentStatus.status === 'PAID') {
          const paid = await this.confirmPaidPurchase(
            purchase.id,
            currentStatus.providerPaymentId || purchase.providerPaymentId,
            (process.env.PAYMENT_PROVIDER || 'MERCADOPAGO').toUpperCase(),
            purchase.paymentMethod || dto.paymentMethod,
          );
          return {
            purchaseId: paid.id,
            status: paid.status,
            amount: Number(paid.finalAmount),
            currency: paid.currency,
            paymentMethod: paid.paymentMethod || dto.paymentMethod,
            pricing: purchasePricing(paid),
          };
        }
        if (currentStatus.status === 'PENDING') {
          if (dto.paymentMethod === purchase.paymentMethod) {
            return {
              purchaseId: purchase.id,
              status: purchase.status,
              amount: Number(purchase.finalAmount),
              currency: purchase.currency,
              paymentMethod: dto.paymentMethod,
              pixDetails: currentStatus.pixDetails
                ? {
                    copyPaste: currentStatus.pixDetails.copyPaste,
                    qrCodeBase64: currentStatus.pixDetails.qrCodeBase64,
                    expiresAt: currentStatus.pixDetails.expiresAt,
                    ticketUrl: currentStatus.pixDetails.ticketUrl,
                  }
                : undefined,
              pricing: purchasePricing(purchase),
            };
          } else {
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
          couponId: calc.coupon?.id,
          tripId: dto.tripId,
          status: PurchaseStatus.PENDING,
          amount: calc.finalAmount,
          originalAmount: listDecimal,
          discountAmount: calc.discountAmount,
          finalAmount: calc.finalAmount,
          currency: listPrice.currency,
          idempotencyKey,
        },
      });
    } else {
      // Update existing PENDING purchase with latest pricing snapshot and coupon
      purchase = await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          couponId: calc.coupon?.id,
          amount: calc.finalAmount,
          originalAmount: listDecimal,
          discountAmount: calc.discountAmount,
          finalAmount: calc.finalAmount,
          currency: listPrice.currency,
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
      pricing: purchasePricing(updatedPurchase),
    };
  }

  // WEBHOOK HANDLING (PHASE K3, K3.1, K3.2 & K4 HARDENED)
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

    const notificationId = body?.id != null ? String(body.id) : undefined;
    const eventId = notificationId
      ? `mp_evt_${notificationId}`
      : dataId
      ? `mp_pay_${dataId}`
      : undefined;

    if (!eventId) {
      throw new BadRequestException('Notificação inválida: ID de notificação ausente');
    }

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
      } else if (paymentResult.status === 'CHARGEBACK') {
        this.logger.warn(`[FINANCIAL_ALERT] Purchase ${purchase.id} foi alterada para CHARGEBACK`);
        const updatedPurchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: PurchaseStatus.CHARGEBACK,
            chargebackAt: new Date(),
            refundedAt: new Date(),
          },
        });
        return { status: 'OK', purchaseStatus: 'CHARGEBACK', purchaseId: updatedPurchase.id };
      } else if (paymentResult.status === 'REFUNDED') {
        this.logger.warn(`[FINANCIAL_ALERT] Purchase ${purchase.id} foi alterada para REFUNDED`);
        const updatedPurchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: PurchaseStatus.REFUNDED,
            refundedAt: new Date(),
          },
        });
        return { status: 'OK', purchaseStatus: 'REFUNDED', purchaseId: updatedPurchase.id };
      } else {
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

    let pixDetails;
    if (
      purchase.status === PurchaseStatus.PENDING &&
      purchase.providerPaymentId
    ) {
      try {
        const provider = this.resolvePaymentProvider();
        const currentStatus = await provider.getPaymentStatus?.(purchase.providerPaymentId);

        // Reconcile when the provider reports PAID (TEST-MOCK / sandbox approval / webhook lag).
        if (currentStatus?.status === 'PAID') {
          await this.confirmPaidPurchase(
            purchaseId,
            currentStatus.providerPaymentId || purchase.providerPaymentId,
            (process.env.PAYMENT_PROVIDER || 'MERCADOPAGO').toUpperCase(),
            purchase.paymentMethod || 'PIX',
          );
          const refreshed = await this.prisma.purchase.findUnique({
            where: { id: purchaseId },
            include: { trip: { select: { id: true, premiumUnlockedAt: true } } },
          });
          if (!refreshed) throw new NotFoundException('Compra não encontrada');
          return {
            purchaseId: refreshed.id,
            status: refreshed.status,
            paidAt: refreshed.paidAt,
            premiumUnlocked: refreshed.trip?.premiumUnlockedAt != null,
            pixDetails: undefined,
          };
        }

        if (purchase.paymentMethod === 'PIX' && currentStatus?.pixDetails) {
          pixDetails = {
            copyPaste: currentStatus.pixDetails.copyPaste,
            qrCodeBase64: currentStatus.pixDetails.qrCodeBase64,
            expiresAt: currentStatus.pixDetails.expiresAt,
            ticketUrl: currentStatus.pixDetails.ticketUrl,
          };
        }
      } catch (_) {}
    }

    return {
      purchaseId: purchase.id,
      status: purchase.status,
      paidAt: purchase.paidAt,
      premiumUnlocked: purchase.trip?.premiumUnlockedAt != null,
      pixDetails,
    };
  }

  // USER
  async getActiveProducts() {
    return this.prisma.product.findMany({ where: { active: true } });
  }

  async createMockPurchase(userId: string, dto: CreateMockPurchaseDto) {
    this.checkMockEnabled();

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

      // Duration-based list price for itinerary unlock (same rule as checkout)
      if (product.type === ProductType.ITINERARY_FULL_ACCESS) {
        const listPrice = await this.resolveListPriceForTrip(trip);
        const listDecimal = new Prisma.Decimal(listPrice.amountDecimal);
        return this.prisma.purchase.create({
          data: {
            userId,
            productId: product.id,
            tripId: dto.tripId,
            status: PurchaseStatus.PENDING,
            amount: listDecimal,
            originalAmount: listDecimal,
            discountAmount: 0,
            finalAmount: listDecimal,
            currency: listPrice.currency,
            idempotencyKey: dto.idempotencyKey,
          },
        });
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
      include: { product: true, coupon: true, trip: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ADMIN — PRODUCTS & COUPONS
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

  async createCoupon(dto: CreateCouponDto) {
    const code = this.normalizeCouponCode(dto.code);
    if (!code) throw new BadRequestException('Código do cupom inválido');

    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Código de cupom já cadastrado');

    return this.prisma.coupon.create({
      data: {
        code,
        discountType: dto.discountType,
        discountValue: new Prisma.Decimal(dto.discountValue),
        productType: dto.productType || ProductType.ITINERARY_FULL_ACCESS,
        active: dto.active ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async getAdminCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getAdminCouponDetails(id: string) {
    const c = await this.prisma.coupon.findUnique({
      where: { id },
      include: { purchases: { select: { id: true, status: true, createdAt: true } } },
    });
    if (!c) throw new NotFoundException('Cupom não encontrado');
    return c;
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');

    const data: any = {};
    if (dto.code) {
      const code = this.normalizeCouponCode(dto.code);
      if (code && code !== coupon.code) {
        const existing = await this.prisma.coupon.findUnique({ where: { code } });
        if (existing) throw new ConflictException('Código de cupom já cadastrado');
        data.code = code;
      }
    }
    if (dto.discountType) data.discountType = dto.discountType;
    if (dto.discountValue != null) data.discountValue = new Prisma.Decimal(dto.discountValue);
    if (dto.productType !== undefined) data.productType = dto.productType;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    return this.prisma.coupon.update({ where: { id }, data });
  }

  async deactivateCoupon(id: string) {
    return this.prisma.coupon.update({
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
          coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
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
        coupon: true,
        trip: true,
      },
    });
    if (!p) throw new NotFoundException('Compra não encontrada');
    return p;
  }
}
