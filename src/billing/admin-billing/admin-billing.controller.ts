import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BillingService } from '../billing.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateProductDto, UpdateProductDto } from '../dto/billing.dto';

@ApiTags('Admin - Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('products')
  @ApiOperation({ summary: 'Criar um produto (Admin)' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.billingService.createProduct(dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'Listar todos os produtos (Admin)' })
  getProducts() {
    return this.billingService.getAdminProducts();
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Editar um produto (Admin)' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.billingService.updateProduct(id, dto);
  }

  @Patch('products/:id/deactivate')
  @ApiOperation({ summary: 'Desativar um produto (Admin)' })
  deactivateProduct(@Param('id') id: string) {
    return this.billingService.deactivateProduct(id);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Listar todas as compras (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'productId', required: false, type: String })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  getPurchases(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('productId') productId?: string,
    @Query('tripId') tripId?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    return this.billingService.getAdminPurchases(pageNumber, limitNumber, { status, userId, productId, tripId });
  }

  @Get('purchases/:id')
  @ApiOperation({ summary: 'Detalhes de uma compra (Admin)' })
  getPurchaseDetails(@Param('id') id: string) {
    return this.billingService.getAdminPurchaseDetails(id);
  }
}
