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
  amount?: number;
  currency?: string;
  purchaseId?: string;
  paidAt?: Date;
  error?: string;
}

export interface CardIntentResult {
  /** Client-side token / preference id for card SDK (stub when no real provider). */
  intentId: string;
  status: 'REQUIRES_CONFIRMATION' | 'READY' | 'UNSUPPORTED';
  publicKey?: string;
  amount: number;
  currency: string;
  /** Opaque payload for Brick / Payment Sheet when wired. */
  clientSecret?: string;
  expiresAt?: string;
  message?: string;
}

export interface PaymentProvider {
  processPayment(input: ProcessPaymentInput): Promise<PaymentResult>;
  getPaymentStatus?(providerPaymentId: string): Promise<PaymentResult>;
  /** Cancel / expire a pending charge (PIX TTL or user abandon). */
  expirePayment?(providerPaymentId: string): Promise<PaymentResult>;
}
