export interface ProcessPaymentInput {
  userId: string;
  amount: number;
  currency: string;
  description?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentProvider {
  processPayment(input: ProcessPaymentInput): Promise<PaymentResult>;
}
