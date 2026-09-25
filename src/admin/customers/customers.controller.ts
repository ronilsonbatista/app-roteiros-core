import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CustomersQueryDto, LeadsQueryDto, UpdateConsentDto } from './dto/customers.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin - Customers & CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os clientes com filtros de CRM, estágio e métricas' })
  getCustomers(@Query() query: CustomersQueryDto) {
    return this.customersService.getCustomers(query);
  }

  @Get(':id/360')
  @ApiOperation({ summary: 'Visão 360 completa do cliente com timeline cronológica' })
  getCustomer360(@Param('id') id: string) {
    return this.customersService.getCustomer360(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes do cliente' })
  getCustomer(@Param('id') id: string) {
    return this.customersService.getCustomer360(id);
  }

  @Patch(':id/consent')
  @ApiOperation({ summary: 'Atualizar consentimento de marketing (LGPD)' })
  updateConsent(
    @Param('id') id: string,
    @Body() dto: UpdateConsentDto,
  ) {
    return this.customersService.updateConsent(id, dto.consent);
  }
}

@ApiTags('Admin - Leads & Funnel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/leads')
export class LeadsController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar leads e jornadas anônimas de planejamento' })
  getLeads(@Query() query: LeadsQueryDto) {
    return this.customersService.getLeads(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes completos de um lead / jornada anônima' })
  getLeadDetails(@Param('id') id: string) {
    return this.customersService.getLeadDetails(id);
  }
}
