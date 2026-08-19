import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AdminBillingController } from './admin-billing/admin-billing.controller';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { MercadoPagoPaymentProvider } from './providers/mercadopago-payment.provider';

@Module({
  providers: [BillingService, MockPaymentProvider, MercadoPagoPaymentProvider],
  controllers: [BillingController, AdminBillingController],
  exports: [BillingService, MercadoPagoPaymentProvider],
})
export class BillingModule {}
