import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  SendTestEmailDto,
} from './dto/marketing.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin - Marketing (Segments)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/marketing/segments')
export class MarketingSegmentsController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os segmentos de clientes' })
  getSegments() {
    return this.marketingService.getSegments();
  }

  @Post()
  @ApiOperation({ summary: 'Criar um novo segmento com critérios de filtro' })
  createSegment(@Body() dto: CreateSegmentDto) {
    return this.marketingService.createSegment(dto);
  }

  @Post('preview-query')
  @ApiOperation({ summary: 'Prévia de audiência e contagem dinâmica por critérios' })
  previewQuery(@Body() criteria: Record<string, any>) {
    return this.marketingService.previewAudience(criteria);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de um segmento' })
  getSegment(@Param('id') id: string) {
    return this.marketingService.getSegment(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar um segmento' })
  updateSegment(@Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.marketingService.updateSegment(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir um segmento' })
  deleteSegment(@Param('id') id: string) {
    return this.marketingService.deleteSegment(id);
  }
}

@ApiTags('Admin - Marketing (Templates)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/marketing/templates')
export class MarketingTemplatesController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos os templates de e-mail' })
  getTemplates() {
    return this.marketingService.getTemplates();
  }

  @Post()
  @ApiOperation({ summary: 'Criar um novo template de e-mail' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.marketingService.createTemplate(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de um template de e-mail' })
  getTemplate(@Param('id') id: string) {
    return this.marketingService.getTemplate(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar um template de e-mail' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.marketingService.updateTemplate(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir um template de e-mail' })
  deleteTemplate(@Param('id') id: string) {
    return this.marketingService.deleteTemplate(id);
  }
}

@ApiTags('Admin - Marketing (Campaigns)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/marketing/campaigns')
export class MarketingCampaignsController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar campanhas com métricas' })
  getCampaigns(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketingService.getCampaigns(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Criar uma nova campanha (DRAFT)' })
  createCampaign(@CurrentUser() admin: any, @Body() dto: CreateCampaignDto) {
    return this.marketingService.createCampaign(dto, admin?.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes completos da campanha' })
  getCampaign(@Param('id') id: string) {
    return this.marketingService.getCampaign(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar campanha' })
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.marketingService.updateCampaign(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir campanha' })
  deleteCampaign(@Param('id') id: string) {
    return this.marketingService.deleteCampaign(id);
  }

  @Post(':id/dry-run')
  @ApiOperation({ summary: 'Executar dry-run: prévia de audiência, exclusões LGPD e HTML renderizado' })
  dryRun(@Param('id') id: string) {
    return this.marketingService.dryRun(id);
  }

  @Post(':id/send-test')
  @ApiOperation({ summary: 'Enviar e-mail de teste seguro para o endereço especificado' })
  sendTestEmail(
    @Param('id') id: string,
    @Body() dto: SendTestEmailDto,
  ) {
    return this.marketingService.sendTestEmail(id, dto.email);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Agendar ou disparar campanha (guardado por flag fail-closed)' })
  scheduleCampaign(
    @Param('id') id: string,
    @Body('scheduledAt') scheduledAt?: string,
  ) {
    return this.marketingService.scheduleOrSend(id, scheduledAt);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar agendamento de campanha' })
  cancelCampaign(@Param('id') id: string) {
    return this.marketingService.cancelCampaign(id);
  }
}
