import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanningSessionDto } from './dto/create-planning-session.dto';
import { UpdatePlanningSessionDto } from './dto/update-planning-session.dto';
import {
  PlanningSessionResponseDto,
  CreatePlanningSessionResponseDto,
  GenerationStatusResponseDto,
} from './dto/planning-session-response.dto';
import { GuestJourneyStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import * as crypto from 'crypto';

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async createSession(
    dto: CreatePlanningSessionDto,
  ): Promise<CreatePlanningSessionResponseDto> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const ttlDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    const journey = await this.prisma.guestJourney.create({
      data: {
        guestTokenHash: tokenHash,
        status: GuestJourneyStatus.COLLECTING,
        answersVersion: dto.answersVersion || 1,
        currentStep: dto.initialStep || 1,
        expiresAt,
      },
    });

    return {
      ...this.mapToResponse(journey),
      guestToken: rawToken,
    };
  }

  async getSession(
    id: string,
    journeyFromGuard?: any,
  ): Promise<PlanningSessionResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);

    return this.mapToResponse(journey);
  }

  async updateProgress(
    id: string,
    dto: UpdatePlanningSessionDto,
    journeyFromGuard?: any,
  ): Promise<PlanningSessionResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);
    this.checkEditableState(journey);

    // Business rules validation
    if (dto.destinations) {
      this.validateDestinations(dto.destinations);
    }
    if (dto.travelers) {
      this.validateTravelers(dto.travelers);
    }
    if (dto.activityWindow) {
      this.validateActivityWindow(dto.activityWindow);
    }

    const updateData: any = {};
    if (dto.currentStep !== undefined) updateData.currentStep = dto.currentStep;
    if (dto.destinations !== undefined) updateData.destinations = dto.destinations as any;
    if (dto.travelers !== undefined) updateData.travelers = dto.travelers as any;
    if (dto.interests !== undefined) updateData.interests = dto.interests;
    if (dto.activityWindow !== undefined) updateData.activityHours = dto.activityWindow as any;
    if (dto.travelStyle !== undefined) updateData.travelStyle = dto.travelStyle;
    if (dto.budgetLevel !== undefined) updateData.budgetLevel = dto.budgetLevel;

    const updated = await this.prisma.guestJourney.update({
      where: { id },
      data: updateData,
    });

    return this.mapToResponse(updated);
  }

  async finalizeQuestionnaire(
    id: string,
    journeyFromGuard?: any,
  ): Promise<PlanningSessionResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);
    this.checkEditableState(journey);

    // Validate completeness
    const missing: string[] = [];

    const destinations = journey.destinations as any[];
    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      missing.push('destinations');
    }

    const travelers = journey.travelers as any;
    if (!travelers || (travelers.adults + travelers.children + travelers.elders) <= 0) {
      missing.push('travelers');
    }

    const interests = journey.interests as string[];
    if (!interests || !Array.isArray(interests) || interests.length === 0) {
      missing.push('interests');
    }

    const activityHours = journey.activityHours as any;
    if (!activityHours || !activityHours.startTime || !activityHours.endTime) {
      missing.push('activityWindow');
    }

    if (!journey.budgetLevel && !journey.travelStyle) {
      missing.push('budgetLevel/travelStyle');
    }

    if (missing.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_INCOMPLETE',
        message: `Questionário incompleto para finalização. Seções pendentes: ${missing.join(', ')}`,
      });
    }

    const finalized = await this.prisma.guestJourney.update({
      where: { id },
      data: {
        status: GuestJourneyStatus.READY_TO_GENERATE,
        currentStep: 6,
      },
    });

    return this.mapToResponse(finalized);
  }

  private async findAndValidate(id: string) {
    const journey = await this.prisma.guestJourney.findUnique({
      where: { id },
    });
    if (!journey) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLANNING_JOURNEY_NOT_FOUND',
        message: 'Jornada de planejamento não encontrada',
      });
    }
    return journey;
  }

  private checkExpiration(journey: any) {
    if (journey.expiresAt && new Date() > new Date(journey.expiresAt)) {
      if (journey.status === GuestJourneyStatus.COLLECTING) {
        this.prisma.guestJourney
          .update({
            where: { id: journey.id },
            data: { status: GuestJourneyStatus.EXPIRED },
          })
          .catch((err) =>
            this.logger.error(`Erro ao atualizar status expirado para ${journey.id}`, err),
          );
      }
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'PLANNING_JOURNEY_EXPIRED',
        message: 'Sessão de planejamento expirada',
      });
    }
  }

  private checkEditableState(journey: any) {
    if (journey.status !== GuestJourneyStatus.COLLECTING) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_JOURNEY_LOCKED',
        message:
          'Após a finalização, não é possível alterar as informações do questionário.',
      });
    }
  }

  private validateDestinations(destinations: any[]) {
    if (!Array.isArray(destinations) || destinations.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_INVALID_DESTINATIONS',
        message: 'Lista de destinos não pode ser vazia',
      });
    }

    for (const dest of destinations) {
      if (!dest.name) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PLANNING_INVALID_DESTINATIONS',
          message: 'Nome do destino é obrigatório',
        });
      }
      if (dest.arrivalDate && dest.departureDate) {
        const arrival = new Date(dest.arrivalDate);
        const departure = new Date(dest.departureDate);
        if (arrival >= departure) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'PLANNING_INVALID_DESTINATIONS',
            message: `Data de chegada (${dest.arrivalDate}) deve ser anterior à data de partida (${dest.departureDate}) no destino ${dest.name}`,
          });
        }
      }
    }
  }

  private validateTravelers(travelers: any) {
    const total =
      (travelers.adults || 0) +
      (travelers.children || 0) +
      (travelers.elders || 0);

    if (total <= 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_INVALID_TRAVELERS',
        message: 'Quantidade total de viajantes deve ser maior que zero',
      });
    }
    if (travelers.adults < 0 || travelers.children < 0 || travelers.elders < 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_INVALID_TRAVELERS',
        message: 'Contagem de viajantes não pode ser negativa',
      });
    }
  }

  private validateActivityWindow(window: any) {
    if (window.startTime && window.endTime) {
      if (window.startTime >= window.endTime) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PLANNING_INVALID_ACTIVITY_WINDOW',
          message: `Horário de início (${window.startTime}) deve ser anterior ao horário de fim (${window.endTime})`,
        });
      }
    }
  }

  async startGeneration(
    id: string,
    journeyFromGuard?: any,
  ): Promise<GenerationStatusResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);

    // Idempotency: if PREVIEW_READY, return status
    if (journey.status === GuestJourneyStatus.PREVIEW_READY) {
      return this.mapToGenerationStatusResponse(journey);
    }

    // Idempotency & Stale Check for GENERATING status
    if (journey.status === GuestJourneyStatus.GENERATING) {
      const elapsedMinutes = journey.generationStartedAt
        ? (new Date().getTime() - new Date(journey.generationStartedAt).getTime()) /
          (1000 * 60)
        : 0;

      if (elapsedMinutes < 3) {
        // Active generation in progress -> return current status immediately
        return this.mapToGenerationStatusResponse(journey);
      } else {
        this.logger.warn(
          `Geração estagnada detectada para jornada ${id} (iniciada há ${Math.round(elapsedMinutes)} min). Permitindo reinício.`,
        );
      }
    }

    if (
      journey.status !== GuestJourneyStatus.READY_TO_GENERATE &&
      journey.status !== GuestJourneyStatus.GENERATING &&
      journey.status !== GuestJourneyStatus.FAILED
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_NOT_READY_FOR_GENERATION',
        message: `Status atual (${journey.status}) não permite iniciar geração. A jornada deve estar no status READY_TO_GENERATE ou FAILED.`,
      });
    }

    // Cooldown check for retries
    if (journey.status === GuestJourneyStatus.FAILED && journey.generationFailedAt) {
      const elapsedSeconds =
        (new Date().getTime() - new Date(journey.generationFailedAt).getTime()) / 1000;
      if (elapsedSeconds < 60) {
        const remaining = Math.ceil(60 - elapsedSeconds);
        throw new BadRequestException({
          statusCode: 400,
          code: 'PLANNING_GENERATION_COOLDOWN',
          message: `Aguarde ${remaining} segundos antes de tentar gerar novamente.`,
        });
      }
    }

    // Concurrency Lock: Atomic status transition to GENERATING
    try {
      const updated = await this.prisma.guestJourney.update({
        where: { id },
        data: {
          status: GuestJourneyStatus.GENERATING,
          generationStartedAt: new Date(),
          generationFailedAt: null,
          generationErrorCode: null,
        },
      });

      // Trigger async AI generation background task without awaiting HTTP controller response
      this.aiService
        .generateGuestItinerary(updated)
        .catch((err) =>
          this.logger.error(`Erro ao disparar geração assíncrona para ${id}`, err),
        );

      return this.mapToGenerationStatusResponse(updated);
    } catch (error) {
      // In case of concurrency race condition where another process updated the record
      const current = await this.findAndValidate(id);
      return this.mapToGenerationStatusResponse(current);
    }
  }

  async getGenerationStatus(
    id: string,
    journeyFromGuard?: any,
  ): Promise<GenerationStatusResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);

    return this.mapToGenerationStatusResponse(journey);
  }

  private mapToResponse(journey: any): PlanningSessionResponseDto {
    return {
      id: journey.id,
      status: journey.status,
      answersVersion: journey.answersVersion,
      currentStep: journey.currentStep,
      destinations: journey.destinations || undefined,
      travelers: journey.travelers || undefined,
      interests: journey.interests || undefined,
      activityHours: journey.activityHours || undefined,
      travelStyle: journey.travelStyle || undefined,
      budgetLevel: journey.budgetLevel || undefined,
      expiresAt: journey.expiresAt,
      createdAt: journey.createdAt,
      updatedAt: journey.updatedAt,
    };
  }

  private mapToGenerationStatusResponse(journey: any): GenerationStatusResponseDto {
    return {
      id: journey.id,
      status: journey.status,
      generationStartedAt: journey.generationStartedAt || undefined,
      generationCompletedAt: journey.generationCompletedAt || undefined,
      generationFailedAt: journey.generationFailedAt || undefined,
      generationErrorCode: journey.generationErrorCode || undefined,
    };
  }
}
