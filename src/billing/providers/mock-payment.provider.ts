import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentProvider,
  ProcessPaymentInput,
  PaymentResult,
} from './payment-provider.interface';
import { v4 as uuidv4 } from 'uuid';

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
      transactionId: `mock_txn_${uuidv4().replace(/-/g, '')}`,
    };
  }
}
