import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentProvider,
  ProcessPaymentInput,
  PaymentResult,
} from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name);

  async processPayment(input: ProcessPaymentInput): Promise<PaymentResult> {
    this.logger.log(
      `Processando pagamento MOCK para o usuário ${input.userId} no valor de ${input.amount} ${input.currency}`,
    );

    // Simula tempo de processamento
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock sempre aprova no desenvolvimento
    return {
      success: true,
      transactionId: `mock_txn_${randomUUID().replace(/-/g, '')}`,
    };
  }
}
