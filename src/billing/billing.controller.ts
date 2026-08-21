import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateMockPurchaseDto,
  CheckoutQuoteDto,
  CheckoutPurchaseDto,
  CheckoutSummaryDto,
  CheckoutQuoteResponseDto,
  CheckoutResponseDto,
} from './dto/billing.dto';

@ApiTags('Billing - App')
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('products')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar produtos ativos para compra' })
  getProducts() {
    return this.billingService.getActiveProducts();
  }

  @Get('users/me/purchases')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar as compras do usuário logado' })
  getMyPurchases(@CurrentUser() user: any) {
    return this.billingService.getUserPurchases(user.userId);
  }

  @Get('purchases/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obter status de pagamento de uma compra' })
  getPurchaseStatus(@CurrentUser() user: any, @Param('id') purchaseId: string) {
    return this.billingService.getPurchaseStatus(user.userId, purchaseId);
  }

  @Get('trips/:tripId/checkout-summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obter resumo de checkout para uma viagem' })
  getCheckoutSummary(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
  ): Promise<CheckoutSummaryDto> {
    return this.billingService.getCheckoutSummary(user.userId, tripId);
  }

  @Post('trips/:tripId/checkout-quote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Simular quote de checkout com cupom (opcional)' })
  getCheckoutQuote(
    @CurrentUser() user: any,
    @Param('tripId') tripId: string,
    @Body() dto: CheckoutQuoteDto,
  ): Promise<CheckoutQuoteResponseDto> {
    return this.billingService.getCheckoutQuote(user.userId, tripId, dto);
  }

  @Post('purchases/checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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

  @Post('webhooks/mercadopago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Endpoint público para notificações Webhook do Mercado Pago' })
  @ApiHeader({ name: 'x-signature', required: false })
  @ApiHeader({ name: 'x-request-id', required: false })
  handleMercadoPagoWebhook(
    @Headers() headers: Record<string, string>,
    @Body() body: any,
  ) {
    return this.billingService.handleMercadoPagoWebhook(headers, body);
  }

  @Post('purchases/mock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Criar uma compra mockada (status PENDING)' })
  createPurchase(@CurrentUser() user: any, @Body() dto: CreateMockPurchaseDto) {
    return this.billingService.createMockPurchase(user.userId, dto);
  }

  @Post('purchases/:id/confirm-mock-payment')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Confirmar pagamento mock (muda status para PAID)' })
  confirmPayment(@CurrentUser() user: any, @Param('id') purchaseId: string) {
    return this.billingService.confirmMockPayment(user.userId, purchaseId);
  }
}
