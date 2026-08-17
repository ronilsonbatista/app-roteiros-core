import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin - Dashboard', 'Admin - Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/dashboard')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Resumo geral da plataforma (KPIs)' })
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Analytics Financeiro / Faturamento' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getRevenue(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getRevenue(startDate, endDate);
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Analytics de Inteligência Artificial' })
  getAiUsage() {
    return this.analyticsService.getAiUsage();
  }

  @Get('top-destinations')
  @ApiOperation({ summary: 'Destinos mais populares' })
  getTopDestinations() {
    return this.analyticsService.getTopDestinations();
  }

  @Get('users-growth')
  @ApiOperation({ summary: 'Crescimento de base de usuários' })
  getUsersGrowth() {
    return this.analyticsService.getUsersGrowth();
  }

  @Get('trips-growth')
  @ApiOperation({ summary: 'Crescimento de roteiros gerados' })
  getTripsGrowth() {
    return this.analyticsService.getTripsGrowth();
  }

  @Get('storage')
  @ApiOperation({ summary: 'Monitoramento de mídia estática' })
  getStorageStats() {
    return this.analyticsService.getStorageStats();
  }

  @Get('system-health')
  @ApiOperation({ summary: 'Status e integridade dos serviços' })
  getSystemHealth() {
    return this.analyticsService.getSystemHealth();
  }
}
