export interface ProcessPaymentInput {
  userId: string;
  purchaseId?: string;
  amount: number;
  currency: string;
  description?: string;
  paymentMethod?: string;
  cardToken?: string;
  installments?: number;
  idempotencyKey?: string;
  payerEmail?: string;
}

export interface PixDetails {
  copyPaste?: string;
  qrCodeBase64?: string;
  expiresAt?: string;
  ticketUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  status?: string;
  transactionId?: string;
  providerPaymentId?: string;
  pixDetails?: PixDetails;
  error?: string;
}

export interface PaymentProvider {
  processPayment(input: ProcessPaymentInput): Promise<PaymentResult>;
  getPaymentStatus?(providerPaymentId: string): Promise<PaymentResult>;
}
