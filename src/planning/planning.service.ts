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
import {
  PlanningPreviewResponseDto,
  PlanningVisibleActivityDto,
  PlanningVisibleDayDto,
  PlanningLockedDayDto,
} from './dto/planning-preview-response.dto';
import { ClaimGuestJourneyResponseDto } from './dto/claim-guest-journey-response.dto';
import { GuestJourneyStatus, ProductType, ItineraryCategory, TripStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import * as crypto from 'crypto';

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  // Configurable policy settings in Core (Admin Policy Gaps registered)
  private visibleDayCountConfig = 1;
  private autoPaywallDelaySecondsConfig = 10;

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  // Helper method for testing configurable policy
  setVisibleDayCountConfig(count: number) {
    this.visibleDayCountConfig = count;
  }

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

      this.aiService
        .generateGuestItinerary(updated)
        .catch((err) =>
          this.logger.error(`Erro ao disparar geração assíncrona para ${id}`, err),
        );

      return this.mapToGenerationStatusResponse(updated);
    } catch (error) {
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

  async getPreview(
    id: string,
    journeyFromGuard?: any,
  ): Promise<PlanningPreviewResponseDto> {
    const journey = journeyFromGuard || (await this.findAndValidate(id));

    this.checkExpiration(journey);

    if (journey.status === GuestJourneyStatus.FAILED) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_GENERATION_FAILED',
        message: 'A geração do roteiro falhou. Tente gerar novamente.',
      });
    }

    if (
      journey.status !== GuestJourneyStatus.PREVIEW_READY &&
      journey.status !== GuestJourneyStatus.CLAIMED
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_NOT_READY_FOR_PREVIEW',
        message: `Status atual (${journey.status}) não permite visualizar o preview. Aguarde a conclusão da geração.`,
      });
    }

    const generatedItinerary = journey.generatedItinerary as any;
    if (!generatedItinerary || !Array.isArray(generatedItinerary.days)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_ITINERARY_NOT_FOUND',
        message: 'Roteiro gerado não encontrado na jornada.',
      });
    }

    const allDays: any[] = generatedItinerary.days;
    const destinations: any[] = (journey.destinations as any[]) || [];

    // Summary metadata
    const startDate = destinations[0]?.arrivalDate || undefined;
    const endDate = destinations[destinations.length - 1]?.departureDate || undefined;

    // Cover image resolution
    let coverImageUrl: string | undefined = undefined;
    if (destinations.length > 0) {
      const baseTripMatch = await this.prisma.baseTrip.findFirst({
        where: {
          destination: {
            contains: destinations[0].name,
            mode: 'insensitive',
          },
          coverImage: { not: null },
        },
        select: { coverImage: true },
      });
      if (baseTripMatch?.coverImage) {
        coverImageUrl = baseTripMatch.coverImage;
      }
    }

    const summary = {
      destinations,
      startDate,
      endDate,
      totalDays: allDays.length,
      coverImageUrl,
    };

    const visibleDayCount = this.visibleDayCountConfig;

    // SERVER-SIDE FILTERING: Visible Days
    const visibleDays: PlanningVisibleDayDto[] = allDays
      .slice(0, visibleDayCount)
      .map((day: any, idx: number) => ({
        dayNumber: day.dayNumber || idx + 1,
        date: day.date,
        destination: day.destination || destinations[0]?.name || 'Destino',
        title: day.title || `Dia ${idx + 1}`,
        description: day.description || '',
        activities: (day.items || []).map((item: any, itemIdx: number) => {
          const categoryMatch = Object.values(ItineraryCategory).find(
            (c) => c === item.category,
          );
          return {
            title: item.title || 'Atividade',
            description: item.description || '',
            category: categoryMatch || ItineraryCategory.TOURIST_ATTRACTION,
            period: item.period || 'Manhã',
            cost: Number(item.cost || item.estimatedCost || 0),
            order: item.order || itemIdx + 1,
            location: item.location || '',
            latitude: item.latitude || undefined,
            longitude: item.longitude || undefined,
            providerPlaceId: item.providerPlaceId || undefined,
            imageUrl: item.imageUrl || undefined,
            reservationUrl: item.reservationUrl || undefined,
            ticketUrl: item.ticketUrl || undefined,
            sourceType: item.sourceType || 'AI',
            sourceId: item.sourceId || undefined,
          };
        }),
      }));

    // SERVER-SIDE FILTERING: Locked Days (MINIMAL METADATA, ZERO ACTIVITY LEAKAGE)
    const lockedDays: PlanningLockedDayDto[] = allDays
      .slice(visibleDayCount)
      .map((day: any, idx: number) => ({
        dayNumber: day.dayNumber || visibleDayCount + idx + 1,
        date: day.date,
        destination: day.destination || destinations[0]?.name || 'Destino',
        title: day.title || `Dia ${visibleDayCount + idx + 1}`,
        locked: true,
      }));

    // Unlock Offer from Product table
    const product = await this.prisma.product.findFirst({
      where: { type: ProductType.ITINERARY_FULL_ACCESS, active: true },
      orderBy: { createdAt: 'desc' },
    });

    const unlockOffer = product
      ? {
          productId: product.id,
          code: product.type,
          name: product.name,
          price: product.price,
          currency: product.currency,
          available: product.active,
        }
      : {
          code: ProductType.ITINERARY_FULL_ACCESS,
          name: 'Acesso Completo ao Roteiro',
          price: 19.99,
          currency: 'BRL',
          available: false,
        };

    return {
      id: journey.id,
      status: journey.status,
      summary,
      previewPolicy: {
        visibleDayCount,
        autoPaywallDelaySeconds: this.autoPaywallDelaySecondsConfig,
      },
      visibleDays,
      lockedDays,
      unlockOffer,
    };
  }

  async claimJourney(
    id: string,
    userId: string,
    journeyFromGuard?: any,
  ): Promise<ClaimGuestJourneyResponseDto> {
    const journey =
      journeyFromGuard ||
      (await this.prisma.guestJourney.findUnique({
        where: { id },
      }));

    if (!journey) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PLANNING_JOURNEY_NOT_FOUND',
        message: 'Jornada de planejamento não encontrada',
      });
    }

    // Expiration check
    if (journey.expiresAt && new Date() > new Date(journey.expiresAt)) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'PLANNING_JOURNEY_EXPIRED',
        message: 'Sessão de planejamento expirada',
      });
    }

    // 1. Claim by another user check
    if (journey.claimedUserId && journey.claimedUserId !== userId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_JOURNEY_ALREADY_CLAIMED',
        message: 'Jornada já vinculada a outra conta',
      });
    }

    // 2. Idempotent re-claim by the SAME user check
    if (journey.claimedUserId === userId && journey.createdTripId) {
      return {
        journeyId: journey.id,
        tripId: journey.createdTripId,
        status: GuestJourneyStatus.CLAIMED,
        nextAction: 'CHECKOUT',
      };
    }

    // 3. Status eligibility check
    if (
      journey.status !== GuestJourneyStatus.PREVIEW_READY &&
      journey.status !== GuestJourneyStatus.CLAIMED
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_JOURNEY_NOT_CLAIMABLE',
        message:
          'Jornada de planejamento não está elegível para reivindicação (status deve ser PREVIEW_READY)',
      });
    }

    // 4. Validate generatedItinerary structure
    const generatedItinerary = journey.generatedItinerary as any;
    if (
      !generatedItinerary ||
      !Array.isArray(generatedItinerary.days) ||
      generatedItinerary.days.length === 0
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PLANNING_JOURNEY_NOT_CLAIMABLE',
        message: 'Roteiro gerado não encontrado ou inválido para materialização',
      });
    }

    // Atomic transaction for Trip creation and GuestJourney linking
    return this.prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction for concurrency safety
      const currentJourney = await tx.guestJourney.findUnique({
        where: { id },
      });

      if (!currentJourney) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PLANNING_JOURNEY_NOT_FOUND',
          message: 'Jornada não encontrada',
        });
      }

      // Check again inside transaction for race conditions
      if (
        currentJourney.claimedUserId &&
        currentJourney.claimedUserId !== userId
      ) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'PLANNING_JOURNEY_ALREADY_CLAIMED',
          message: 'Jornada já vinculada a outra conta',
        });
      }

      if (
        currentJourney.claimedUserId === userId &&
        currentJourney.createdTripId
      ) {
        return {
          journeyId: currentJourney.id,
          tripId: currentJourney.createdTripId,
          status: GuestJourneyStatus.CLAIMED,
          nextAction: 'CHECKOUT',
        };
      }

      const destinations = Array.isArray(currentJourney.destinations)
        ? (currentJourney.destinations as any[])
        : [];
      const primaryDestination = destinations[0]?.name || 'Destino';
      const tripTitle =
        destinations.length > 0
          ? `Viagem para ${destinations.map((d: any) => d.name).join(' & ')}`
          : 'Minha Viagem 2GO';

      let coverImage: string | null = destinations[0]?.coverImage || null;
      if (!coverImage && primaryDestination) {
        const baseMatch = await tx.baseTrip.findFirst({
          where: {
            destination: { contains: primaryDestination, mode: 'insensitive' },
            coverImage: { not: null },
          },
          select: { coverImage: true },
        });
        if (baseMatch?.coverImage) {
          coverImage = baseMatch.coverImage;
        }
      }

      const startDateStr = destinations[0]?.arrivalDate;
      const endDateStr = destinations[destinations.length - 1]?.departureDate;
      const startDate = startDateStr ? new Date(startDateStr) : null;
      const endDate = endDateStr ? new Date(endDateStr) : null;

      // Materialize Trip
      const trip = await tx.trip.create({
        data: {
          userId,
          title: tripTitle,
          destination: primaryDestination,
          coverImage,
          startDate,
          endDate,
          status: TripStatus.DRAFT,
          premiumUnlockedAt: null,
          preferences: {
            travelers: currentJourney.travelers,
            interests: currentJourney.interests,
            activityHours: currentJourney.activityHours,
            budgetLevel: currentJourney.budgetLevel,
            travelStyle: currentJourney.travelStyle,
          },
        },
      });

      // Materialize Days & Items
      for (const [dayIdx, day] of generatedItinerary.days.entries()) {
        const dayNumber = day.dayNumber || dayIdx + 1;
        const dayDate = day.date ? new Date(day.date) : null;

        const tripDay = await tx.tripDay.create({
          data: {
            tripId: trip.id,
            dayNumber,
            date: dayDate,
            title: day.title || `Dia ${dayNumber}`,
            description: day.description || null,
          },
        });

        const items = Array.isArray(day.items) ? day.items : [];
        for (const [itemIdx, item] of items.entries()) {
          const categoryMatch =
            Object.values(ItineraryCategory).find((c) => c === item.category) ||
            ItineraryCategory.TOURIST_ATTRACTION;

          await tx.itineraryItem.create({
            data: {
              tripDayId: tripDay.id,
              title: item.title || 'Atividade',
              description: item.description || null,
              category: categoryMatch,
              location: item.location || null,
              googleMapsLink: item.googleMapsLink || null,
              latitude: item.latitude != null ? Number(item.latitude) : null,
              longitude:
                item.longitude != null ? Number(item.longitude) : null,
              timeLabel: item.period || item.timeLabel || null,
              period: item.period || null,
              duration: item.duration != null ? Number(item.duration) : null,
              cost: item.cost != null ? Number(item.cost) : null,
              currency: item.currency || 'BRL',
              externalLink:
                item.ticketUrl ||
                item.reservationUrl ||
                item.externalLink ||
                null,
              order: item.order || itemIdx + 1,
              providerPlaceId: item.providerPlaceId || null,
              placeProvider:
                item.sourceType === 'PLACES' || item.providerPlaceId
                  ? 'GOOGLE'
                  : null,
            },
          });
        }
      }

      // Link GuestJourney to User and Trip and set status CLAIMED
      await tx.guestJourney.update({
        where: { id },
        data: {
          claimedUserId: userId,
          createdTripId: trip.id,
          status: GuestJourneyStatus.CLAIMED,
        },
      });

      return {
        journeyId: currentJourney.id,
        tripId: trip.id,
        status: GuestJourneyStatus.CLAIMED,
        nextAction: 'CHECKOUT',
      };
    });
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
