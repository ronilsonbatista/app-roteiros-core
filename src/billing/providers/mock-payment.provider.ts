import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentProvider,
  ProcessPaymentInput,
  PaymentResult,
} from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

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

  async processPayment(input: ProcessPaymentInput): Promise<PaymentResult> {
    if (!this.isMockPaymentEnabled()) {
      throw new ForbiddenException(
        'MockPaymentProvider is disabled in this environment',
      );
    }

    this.logger.log(
      `Processando pagamento MOCK para o usuário ${input.userId} no valor de ${input.amount} ${input.currency}`,
    );

    // Simula tempo de processamento
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success: true,
      transactionId: `mock_txn_${randomUUID().replace(/-/g, '')}`,
    };
  }
}
