import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateMockPurchaseDto } from './dto/billing.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @ApiTags('Billing - Products')
  @Get('products')
  @ApiOperation({ summary: 'Listar produtos ativos para compra' })
  getProducts() {
    return this.billingService.getActiveProducts();
  }

  @ApiTags('Billing - Purchases')
  @Get('users/me/purchases')
  @ApiOperation({ summary: 'Listar as compras do usuário logado' })
  getMyPurchases(@CurrentUser() user: any) {
    return this.billingService.getUserPurchases(user.userId);
  }

  @ApiTags('Billing - Purchases')
  @Post('purchases/mock')
  @ApiOperation({ summary: 'Criar uma compra mockada (status PENDING)' })
  createPurchase(
    @CurrentUser() user: any,
    @Body() dto: CreateMockPurchaseDto,
  ) {
    return this.billingService.createMockPurchase(user.userId, dto);
  }

  @ApiTags('Billing - Purchases')
  @Post('purchases/:id/confirm-mock-payment')
  @ApiOperation({ summary: 'Confirmar pagamento mock (muda status para PAID)' })
  confirmPayment(
    @CurrentUser() user: any,
    @Param('id') purchaseId: string,
  ) {
    return this.billingService.confirmMockPayment(user.userId, purchaseId);
  }
}
