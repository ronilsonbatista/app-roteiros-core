import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AdminBillingController } from './admin-billing/admin-billing.controller';
import { MockPaymentProvider } from './providers/mock-payment.provider';

@Module({
  providers: [BillingService, MockPaymentProvider],
  controllers: [BillingController, AdminBillingController],
  exports: [BillingService],
})
export class BillingModule {}
