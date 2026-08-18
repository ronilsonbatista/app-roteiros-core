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
} from './dto/planning-session-response.dto';
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
}
