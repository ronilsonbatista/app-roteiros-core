import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { PlanningService } from './planning.service';
import { CreatePlanningSessionDto } from './dto/create-planning-session.dto';
import { UpdatePlanningSessionDto } from './dto/update-planning-session.dto';
import {
  PlanningSessionResponseDto,
  CreatePlanningSessionResponseDto,
  GenerationStatusResponseDto,
} from './dto/planning-session-response.dto';
import { PlanningPreviewResponseDto } from './dto/planning-preview-response.dto';
import { GuestTokenGuard } from './guards/guest-token.guard';
import { LogSanitizerInterceptor } from './interceptors/log-sanitizer.interceptor';

@ApiTags('Planning Sessions (Anonymous)')
@Controller('planning-sessions')
@UseInterceptors(LogSanitizerInterceptor)
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Criar nova sessão anônima de planejamento de roteiro',
    description:
      'Retorna um guestJourneyId e um guestToken de alta entropia. O guestToken é retornado UMA ÚNICA VEZ neste response e deve ser armazenado com segurança no dispositivo (FlutterSecureStorage).',
  })
  @ApiResponse({
    status: 201,
    description: 'Sessão criada com sucesso',
    type: CreatePlanningSessionResponseDto,
  })
  async createSession(
    @Body() dto: CreatePlanningSessionDto,
  ): Promise<CreatePlanningSessionResponseDto> {
    return this.planningService.createSession(dto);
  }

  @Get(':id')
  @UseGuards(GuestTokenGuard)
  @ApiOperation({
    summary: 'Recuperar estado da sessão de planejamento',
    description: 'Requer header X-Guest-Token. Permite restaurar o progresso do questionário.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 200,
    description: 'Estado da jornada retornado',
    type: PlanningSessionResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async getSession(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<PlanningSessionResponseDto> {
    return this.planningService.getSession(id, req.guestJourney);
  }

  @Patch(':id')
  @UseGuards(GuestTokenGuard)
  @ApiOperation({
    summary: 'Atualizar progressivamente as respostas do questionário',
    description:
      'Requer header X-Guest-Token. Permite salvar incrementalmente destinos, passageiros, interesses, horários e orçamento/estilo.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 200,
    description: 'Jornada atualizada com sucesso',
    type: PlanningSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos ou jornada já finalizada (PLANNING_JOURNEY_LOCKED)',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdatePlanningSessionDto,
    @Req() req: any,
  ): Promise<PlanningSessionResponseDto> {
    return this.planningService.updateProgress(id, dto, req.guestJourney);
  }

  @Post(':id/finalize')
  @UseGuards(GuestTokenGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalizar o questionário e congelar as respostas',
    description:
      'Valida que todas as seções obrigatórias foram preenchidas e altera o status da jornada de COLLECTING para READY_TO_GENERATE. Após a finalização, respostas ficam bloqueadas contra alterações.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 200,
    description: 'Questionário finalizado com sucesso (status READY_TO_GENERATE)',
    type: PlanningSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Questionário incompleto (PLANNING_INCOMPLETE) ou jornada já congelada (PLANNING_JOURNEY_LOCKED)',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async finalizeQuestionnaire(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<PlanningSessionResponseDto> {
    return this.planningService.finalizeQuestionnaire(id, req.guestJourney);
  }

  @Post(':id/generate')
  @UseGuards(GuestTokenGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Iniciar geração assíncrona do roteiro via IA',
    description:
      'Dispara a geração de roteiro por IA em segundo plano. Retorna 202 Accepted imediatamente com status GENERATING. O progresso deve ser acompanhado via GET /planning-sessions/:id/generation-status.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 202,
    description: 'Geração iniciada com sucesso (status GENERATING ou PREVIEW_READY)',
    type: GenerationStatusResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Jornada não está no status READY_TO_GENERATE/FAILED ou em cooldown',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async startGeneration(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<GenerationStatusResponseDto> {
    return this.planningService.startGeneration(id, req.guestJourney);
  }

  @Get(':id/generation-status')
  @UseGuards(GuestTokenGuard)
  @ApiOperation({
    summary: 'Consultar status de geração do roteiro',
    description:
      'Retorna metadados de progresso da geração (status, timestamps, código de erro). NUNCA retorna o roteiro completo nesta rota.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 200,
    description: 'Status da geração retornado',
    type: GenerationStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async getGenerationStatus(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<GenerationStatusResponseDto> {
    return this.planningService.getGenerationStatus(id, req.guestJourney);
  }

  @Get(':id/preview')
  @UseGuards(GuestTokenGuard)
  @ApiOperation({
    summary: 'Consultar preview seguro do roteiro gerado',
    description:
      'Retorna projeção segura contendo apenas o Dia 1 totalmente liberado com atividades, metadados mínimos dos dias bloqueados (sem conteúdo privado) e oferta de desbloqueio vinda do banco Core.',
  })
  @ApiHeader({
    name: 'X-Guest-Token',
    description: 'Chave secreta da jornada anônima obtida na criação',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'UUID da jornada de planejamento' })
  @ApiResponse({
    status: 200,
    description: 'Preview do roteiro retornado com sucesso',
    type: PlanningPreviewResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Status atual não permite visualizar o preview (PLANNING_NOT_READY_FOR_PREVIEW ou PLANNING_GENERATION_FAILED)',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou sessão expirada' })
  @ApiResponse({ status: 404, description: 'Jornada não encontrada' })
  async getPreview(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<PlanningPreviewResponseDto> {
    return this.planningService.getPreview(id, req.guestJourney);
  }
}
