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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AiIntelligenceService } from './ai-intelligence.service';
import {
  UpdateGuidelineDto,
  CreateKnowledgeArticleDto,
  UpdateKnowledgeArticleDto,
  EditorialAssistDto,
  PlaygroundSimulateDto,
} from './dto/ai-intelligence.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Admin - AI Intelligence & Governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/ai-intelligence')
export class AiIntelligenceController {
  constructor(private readonly aiIntelligenceService: AiIntelligenceService) {}

  // ==========================================
  // GUIDELINES (VOICE & TONE)
  // ==========================================

  @Get('guidelines')
  @ApiOperation({ summary: 'Obter diretrizes e tom de voz da IA' })
  getGuidelines() {
    return this.aiIntelligenceService.getGuidelines();
  }

  @Patch('guidelines/:key')
  @ApiOperation({ summary: 'Atualizar diretriz de tom de voz ou regra editorial' })
  updateGuideline(
    @Param('key') key: string,
    @Body() dto: UpdateGuidelineDto,
  ) {
    return this.aiIntelligenceService.updateGuideline(key, dto);
  }

  // ==========================================
  // KNOWLEDGE ARTICLES
  // ==========================================

  @Get('knowledge')
  @ApiOperation({ summary: 'Listar artigos e briefings da base de conhecimento' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'destination', required: false, type: String })
  getKnowledge(
    @Query('category') category?: string,
    @Query('destination') destination?: string,
  ) {
    return this.aiIntelligenceService.getKnowledgeArticles(category, destination);
  }

  @Get('knowledge/:id')
  @ApiOperation({ summary: 'Detalhes de um artigo da base de conhecimento' })
  getKnowledgeArticle(@Param('id') id: string) {
    return this.aiIntelligenceService.getKnowledgeArticle(id);
  }

  @Post('knowledge')
  @ApiOperation({ summary: 'Criar novo artigo na base de conhecimento' })
  createKnowledgeArticle(
    @CurrentUser() admin: any,
    @Body() dto: CreateKnowledgeArticleDto,
  ) {
    return this.aiIntelligenceService.createKnowledgeArticle(dto, admin?.userId);
  }

  @Patch('knowledge/:id')
  @ApiOperation({ summary: 'Atualizar artigo na base de conhecimento' })
  updateKnowledgeArticle(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeArticleDto,
  ) {
    return this.aiIntelligenceService.updateKnowledgeArticle(id, dto);
  }

  @Delete('knowledge/:id')
  @ApiOperation({ summary: 'Excluir artigo da base de conhecimento' })
  deleteKnowledgeArticle(@Param('id') id: string) {
    return this.aiIntelligenceService.deleteKnowledgeArticle(id);
  }

  // ==========================================
  // EDITORIAL ASSISTANT & PLAYGROUND
  // ==========================================

  @Post('editorial-assist')
  @ApiOperation({ summary: 'Assistente de IA para geração de rascunhos, títulos e SEO' })
  editorialAssist(@Body() dto: EditorialAssistDto) {
    return this.aiIntelligenceService.editorialAssist(dto);
  }

  @Post('playground')
  @ApiOperation({ summary: 'Simulação segura e isolada da IA sem persistir viagens' })
  playgroundSimulate(@Body() dto: PlaygroundSimulateDto) {
    return this.aiIntelligenceService.playgroundSimulate(dto);
  }
}
