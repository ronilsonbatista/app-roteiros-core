import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin - System & Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly auditService: AuditService,
  ) {}

  @Get('provider-health')
  @ApiOperation({ summary: 'Status de configuração e saúde de todos os provedores' })
  getProviderHealth() {
    return this.systemService.getProviderHealth();
  }

  @Get('search')
  @ApiOperation({ summary: 'Busca global unificada no ecossistema (clientes, viagens, compras, blog)' })
  @ApiQuery({ name: 'q', required: true, type: String })
  globalSearch(@Query('q') query: string) {
    return this.systemService.globalSearch(query);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Trilha de auditoria das ações administrativas' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'entity', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
  ) {
    return this.auditService.getLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { entity, action, userId },
    );
  }
}
