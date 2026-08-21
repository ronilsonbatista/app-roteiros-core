import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  PaymentProvider,
  ProcessPaymentInput,
  PaymentResult,
} from './payment-provider.interface';

@Injectable()
export class MercadoPagoPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MercadoPagoPaymentProvider.name);

  private getAccessToken(): string {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const env = (process.env.NODE_ENV || 'development').toLowerCase();

    if (!token) {
      if (env === 'production' || env === 'staging') {
        throw new ForbiddenException(
          'MERCADO_PAGO_ACCESS_TOKEN is required for Mercado Pago provider in production/staging',
        );
      }
      return 'TEST-MOCK-MERCADOPAGO-ACCESS-TOKEN';
    }

    return token;
  }

  public verifyWebhookSignature(
    xSignatureHeader: string | undefined,
    xRequestIdHeader: string | undefined,
    dataId: string | undefined,
  ): boolean {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    const env = (process.env.NODE_ENV || 'development').toLowerCase();

    if (!secret) {
      if (env === 'production' || env === 'staging') {
        throw new ForbiddenException(
          'MERCADO_PAGO_WEBHOOK_SECRET is required in production/staging',
        );
      }
      return xSignatureHeader === 'test-valid-signature';
    }

    if (!xSignatureHeader || !dataId) {
      return false;
    }

    const parts = xSignatureHeader.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=').map((s) => s.trim());
      if (key && val) acc[key] = val;
      return acc;
    }, {} as Record<string, string>);

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${xRequestIdHeader || ''};ts:${ts};`;
    const calculatedSignature = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return calculatedSignature === v1;
  }

  async processPayment(input: ProcessPaymentInput): Promise<PaymentResult> {
    const accessToken = this.getAccessToken();
    const isPix = input.paymentMethod === 'PIX';
    const isCard = input.paymentMethod === 'CARD';

    if (!isPix && !isCard) {
      throw new BadRequestException(
        `Método de pagamento inválido: ${input.paymentMethod}. Métodos aceitos: PIX, CARD`,
      );
    }

    if (isCard && !input.cardToken) {
      throw new BadRequestException(
        'cardToken é obrigatório para pagamento via cartão',
      );
    }

    const payload: any = {
      transaction_amount: Number(input.amount),
      description: input.description || '2GO - Roteiro Completo Premium',
      external_reference: input.purchaseId,
      payer: {
        email: input.payerEmail || 'customer@2go.app',
      },
    };

    if (isPix) {
      payload.payment_method_id = 'pix';
    } else if (isCard) {
      payload.token = input.cardToken;
      payload.installments = input.installments || 1;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    if (input.idempotencyKey || input.purchaseId) {
      headers['X-Idempotency-Key'] = input.idempotencyKey || input.purchaseId || '';
    }

    try {
      this.logger.log(
        `Enviando solicitação de pagamento ao Mercado Pago para purchase ${input.purchaseId} (${input.paymentMethod})`,
      );

      if (accessToken === 'TEST-MOCK-MERCADOPAGO-ACCESS-TOKEN') {
        return this.handleMockTestResponse(input, isPix);
      }

      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Mercado Pago API error: ${response.status} - ${JSON.stringify(data)}`,
        );
        return {
          success: false,
          status: 'REJECTED',
          error: data.message || 'Falha ao processar pagamento com o provedor Mercado Pago',
        };
      }

      const providerPaymentId = data.id ? String(data.id) : undefined;
      const rawStatus = (data.status || '').toLowerCase();
      const statusMap: Record<string, string> = {
        approved: 'PAID',
        pending: 'PENDING',
        in_process: 'PENDING',
        rejected: 'REJECTED',
        cancelled: 'CANCELLED',
      };
      const status = statusMap[rawStatus] || 'PENDING';
      const success = status === 'PAID' || status === 'PENDING';

      let pixDetails;
      if (isPix && data.point_of_interaction?.transaction_data) {
        const txData = data.point_of_interaction.transaction_data;
        pixDetails = {
          copyPaste: txData.qr_code,
          qrCodeBase64: txData.qr_code_base64,
          ticketUrl: txData.ticket_url,
          expiresAt: data.date_of_expiration,
        };
      }

      return {
        success,
        status,
        providerPaymentId,
        pixDetails,
      };
    } catch (err: any) {
      this.logger.error(`Exceção ao chamar Mercado Pago API: ${err.message}`);
      throw new InternalServerErrorException(
        `Erro de integração com Mercado Pago: ${err.message}`,
      );
    }
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentResult> {
    const accessToken = this.getAccessToken();

    if (accessToken === 'TEST-MOCK-MERCADOPAGO-ACCESS-TOKEN') {
      return {
        success: true,
        status: 'PAID',
        providerPaymentId,
        amount: 19.99,
        currency: 'BRL',
      };
    }

    try {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${providerPaymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new InternalServerErrorException(
          `Falha ao consultar pagamento no Mercado Pago: ${data.message || response.statusText}`,
        );
      }

      const rawStatus = (data.status || '').toLowerCase();
      const statusMap: Record<string, string> = {
        approved: 'PAID',
        pending: 'PENDING',
        in_process: 'PENDING',
        rejected: 'REJECTED',
        cancelled: 'CANCELLED',
        refunded: 'REFUNDED',
        charged_back: 'REFUNDED',
      };
      const status = statusMap[rawStatus] || 'PENDING';

      return {
        success: status === 'PAID',
        status,
        providerPaymentId: String(data.id),
        amount: data.transaction_amount ? Number(data.transaction_amount) : undefined,
        currency: data.currency_id || 'BRL',
        purchaseId: data.external_reference,
        paidAt: data.date_approved ? new Date(data.date_approved) : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Erro ao obter status do pagamento ${providerPaymentId}: ${err.message}`);
      throw new InternalServerErrorException(
        `Erro ao consultar status no Mercado Pago: ${err.message}`,
      );
    }
  }

  private handleMockTestResponse(input: ProcessPaymentInput, isPix: boolean): PaymentResult {
    const fakeId = `mp_test_${Date.now()}`;
    if (isPix) {
      return {
        success: true,
        status: 'PENDING',
        providerPaymentId: fakeId,
        pixDetails: {
          copyPaste: `00020101021226870014br.gov.bcb.pix.test.${fakeId}`,
          qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          ticketUrl: `https://www.mercadopago.com.br/payments/${fakeId}/ticket`,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
      };
    } else {
      const isRejected = input.cardToken === 'invalid-card-token';
      return {
        success: !isRejected,
        status: isRejected ? 'REJECTED' : 'PAID',
        providerPaymentId: fakeId,
        error: isRejected ? 'Cartão recusado pela emissora' : undefined,
      };
    }
  }
}
