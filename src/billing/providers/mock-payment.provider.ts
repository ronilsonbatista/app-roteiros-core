import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentProvider,
  ProcessPaymentInput,
  PaymentResult,
} from './payment-provider.interface';

/**
 * In-memory PIX state for mock provider (secret-free Carrinho QA).
 * Keyed by providerPaymentId.
 */
const mockPixStore = new Map<
  string,
  {
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
    amount: number;
    currency: string;
    purchaseId?: string;
    expiresAt: string;
    copyPaste: string;
    qrCodeBase64: string;
    ticketUrl: string;
  }
>();

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

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

  async processPayment(input: ProcessPaymentInput): Promise<PaymentResult> {
    if (!this.isMockPaymentEnabled()) {
      throw new ForbiddenException(
        'MockPaymentProvider is disabled in this environment',
      );
    }

    this.logger.log(
      `Processando pagamento MOCK para o usuário ${input.userId} no valor de ${input.amount} ${input.currency} (${input.paymentMethod})`,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const providerPaymentId = `mock_pay_${randomUUID().replace(/-/g, '')}`;
    const isPix = (input.paymentMethod || '').toUpperCase() === 'PIX';
    const isCard = (input.paymentMethod || '').toUpperCase() === 'CARD';

    if (isPix) {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const copyPaste = `00020101021226870014br.gov.bcb.pix.mock.${providerPaymentId}`;
      const qrCodeBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const ticketUrl = `https://mock.2go.local/payments/${providerPaymentId}/ticket`;
      mockPixStore.set(providerPaymentId, {
        status: 'PENDING',
        amount: input.amount,
        currency: input.currency,
        purchaseId: input.purchaseId,
        expiresAt,
        copyPaste,
        qrCodeBase64,
        ticketUrl,
      });
      return {
        success: true,
        status: 'PENDING',
        transactionId: providerPaymentId,
        providerPaymentId,
        pixDetails: { copyPaste, qrCodeBase64, ticketUrl, expiresAt },
        amount: input.amount,
        currency: input.currency,
        purchaseId: input.purchaseId,
      };
    }

    if (isCard) {
      const isRejected = input.cardToken === 'invalid-card-token';
      return {
        success: !isRejected,
        status: isRejected ? 'REJECTED' : 'PAID',
        transactionId: providerPaymentId,
        providerPaymentId,
        amount: input.amount,
        currency: input.currency,
        purchaseId: input.purchaseId,
        error: isRejected ? 'Cartão recusado (mock)' : undefined,
        paidAt: isRejected ? undefined : new Date(),
      };
    }

    // Wallet / unknown: accept as pending stub without charging.
    return {
      success: true,
      status: 'PENDING',
      transactionId: providerPaymentId,
      providerPaymentId,
      amount: input.amount,
      currency: input.currency,
      purchaseId: input.purchaseId,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentResult> {
    const stored = mockPixStore.get(providerPaymentId);
    if (stored) {
      const expired =
        stored.status === 'PENDING' && new Date(stored.expiresAt).getTime() < Date.now();
      if (expired) {
        stored.status = 'EXPIRED';
        mockPixStore.set(providerPaymentId, stored);
      }
      return {
        success: stored.status === 'PAID',
        status: stored.status,
        providerPaymentId,
        amount: stored.amount,
        currency: stored.currency,
        purchaseId: stored.purchaseId,
        pixDetails: {
          copyPaste: stored.copyPaste,
          qrCodeBase64: stored.qrCodeBase64,
          ticketUrl: stored.ticketUrl,
          expiresAt: stored.expiresAt,
        },
      };
    }

    // Non-PIX mock charges: treat unknown ids as still pending.
    return {
      success: false,
      status: 'PENDING',
      providerPaymentId,
    };
  }

  async expirePayment(providerPaymentId: string): Promise<PaymentResult> {
    const stored = mockPixStore.get(providerPaymentId);
    if (stored) {
      stored.status = 'EXPIRED';
      mockPixStore.set(providerPaymentId, stored);
      return {
        success: true,
        status: 'EXPIRED',
        providerPaymentId,
        amount: stored.amount,
        currency: stored.currency,
        purchaseId: stored.purchaseId,
      };
    }
    return {
      success: true,
      status: 'EXPIRED',
      providerPaymentId,
    };
  }

  /** Test helper: mark mock PIX as paid. */
  public markPaid(providerPaymentId: string): void {
    const stored = mockPixStore.get(providerPaymentId);
    if (stored) {
      stored.status = 'PAID';
      mockPixStore.set(providerPaymentId, stored);
    }
  }

  /** Test helper: clear in-memory store. */
  public static clearStore(): void {
    mockPixStore.clear();
  }
}
