import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateMockPurchaseDto,
  CheckoutPurchaseDto,
  CheckoutSummaryDto,
  CheckoutResponseDto,
} from './dto/billing.dto';

@ApiTags('Billing - App')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('products')
  @ApiOperation({ summary: 'Listar produtos ativos para compra' })
  getProducts() {
    return this.billingService.getActiveProducts();
  }

  @Get('users/me/purchases')
  @ApiOperation({ summary: 'Listar as compras do usuário logado' })
  getMyPurchases(@CurrentUser() user: any) {
    return this.billingService.getUserPurchases(user.userId);
  }

  @Get('trips/:tripId/checkout-summary')
  @ApiOperation({ summary: 'Obter resumo de checkout para uma viagem' })
  getCheckoutSummary(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
  ): Promise<CheckoutSummaryDto> {
    return this.billingService.getCheckoutSummary(user.userId, tripId);
  }

  @Post('purchases/checkout')
  @ApiOperation({ summary: 'Criar cobrança real e iniciar pagamento (PIX ou CARTÃO)' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  processCheckout(
    @CurrentUser() user: any,
    @Body() dto: CheckoutPurchaseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CheckoutResponseDto> {
    return this.billingService.processCheckoutPurchase(
      user.userId,
      dto,
      idempotencyKey,
      user.email,
    );
  }

  @Post('purchases/mock')
  @ApiOperation({ summary: 'Criar uma compra mockada (status PENDING)' })
  createPurchase(@CurrentUser() user: any, @Body() dto: CreateMockPurchaseDto) {
    return this.billingService.createMockPurchase(user.userId, dto);
  }

  @Post('purchases/:id/confirm-mock-payment')
  @ApiOperation({ summary: 'Confirmar pagamento mock (muda status para PAID)' })
  confirmPayment(@CurrentUser() user: any, @Param('id') purchaseId: string) {
    return this.billingService.confirmMockPayment(user.userId, purchaseId);
  }
}
