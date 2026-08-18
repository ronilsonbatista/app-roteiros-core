import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from './providers/openai.provider';
import { CurationRetrievalService } from './curation/curation-retrieval.service';
import { ItineraryCategory, GuestJourneyStatus } from '@prisma/client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private openAIProvider: OpenAIProvider,
    private curationRetrievalService: CurationRetrievalService,
  ) {}

  async generateItinerary(userId: string, tripId: string, body: any) {
    const { baseTripId } = body;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { days: true },
    });

    if (!trip) throw new NotFoundException('Trip não encontrada');
    if (trip.userId !== userId)
      throw new ForbiddenException('Trip não pertence ao usuário logado');

    if (trip.days && trip.days.length > 0) {
      throw new BadRequestException(
        'Esta viagem já possui um roteiro gerado. Limpe ou edite manualmente os dias atuais antes de gerar novamente.',
      );
    }

    const travelProfile = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
    });

    let baseTrip = null;
    if (baseTripId) {
      baseTrip = await this.prisma.baseTrip.findUnique({
        where: { id: baseTripId },
        include: {
          days: {
            include: { attractions: true, restaurants: true },
          },
        },
      });
      if (!baseTrip) throw new NotFoundException('BaseTrip não encontrada');
    }

    const numberOfDays =
      trip.endDate && trip.startDate
        ? Math.ceil(
            (new Date(trip.endDate).getTime() -
              new Date(trip.startDate).getTime()) /
              (1000 * 3600 * 24),
          ) + 1
        : baseTrip?.numberOfDays || 3;

    let aiRequestRecord;

    try {
      const aiResult = await this.openAIProvider.generateItinerary({
        destination: trip.destination,
        numberOfDays,
        travelProfile,
        baseTrip,
      });

      aiRequestRecord = await this.prisma.aIRequest.create({
        data: {
          userId,
          tripId,
          baseTripId,
          provider: aiResult.provider,
          model: aiResult.model,
          prompt: 'System Prompt + User Context',
          response: aiResult.parsedData,
          status: 'SUCCESS',
          tokensUsed: aiResult.tokensUsed,
        },
      });

      // Parse and save data
      const parsedDays = aiResult.parsedData.days || [];

      for (const day of parsedDays) {
        const tripDay = await this.prisma.tripDay.create({
          data: {
            tripId,
            dayNumber: day.dayNumber,
            title: day.title,
            description: day.description,
          },
        });

        if (day.items && Array.isArray(day.items)) {
          let order = 1;
          for (const item of day.items) {
            // Safe enum fallback
            const categoryMatch = Object.values(ItineraryCategory).find(
              (c) => c === item.category,
            );
            const safeCategory = categoryMatch
              ? categoryMatch
              : ItineraryCategory.TOURIST_ATTRACTION;

            await this.prisma.itineraryItem.create({
              data: {
                tripDayId: tripDay.id,
                title: item.title || 'Atividade',
                description: item.description,
                category: safeCategory,
                location: item.location,
                period: item.period,
                cost: item.estimatedCost || 0,
                order: order++,
                isEditable: true,
                isUserModified: false,
              },
            });
          }
        }
      }

      return {
        message: 'Roteiro gerado com sucesso via IA',
        aiRequestId: aiRequestRecord.id,
      };
    } catch (error) {
      this.logger.error('Erro na geração do roteiro via IA', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';

      await this.prisma.aIRequest.create({
        data: {
          userId,
          tripId,
          baseTripId,
          provider: 'OPENAI',
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          prompt: 'System Prompt + User Context',
          status: 'FAILED',
          errorMessage,
        },
      });

      throw new BadRequestException(
        `Falha ao gerar roteiro via IA: ${errorMessage}`,
      );
    }
  }

  async generateGuestItinerary(journey: any): Promise<void> {
    try {
      const destinations = (journey.destinations as any[]) || [];

      // Phase G2: Retrieve Curated Knowledge Context from PostgreSQL
      const curatedContext = await this.curationRetrievalService.retrieveCuratedContext({
        destinations: destinations.map((d, idx) => ({
          name: d.name,
          providerPlaceId: d.placeId || d.providerPlaceId,
          arrivalDate: d.arrivalDate,
          arrivalTime: d.arrivalTime,
          departureDate: d.departureDate,
          departureTime: d.departureTime,
        })),
        interests: (journey.interests as string[]) || [],
        budgetLevel: journey.budgetLevel,
        travelers: (journey.travelers as any) || { adults: 1, children: 0, elders: 0 },
        travelStyle: journey.travelStyle,
      });

      const input = {
        journeyId: journey.id,
        destinations,
        travelers: (journey.travelers as any) || { adults: 1, children: 0, elders: 0 },
        interests: (journey.interests as string[]) || [],
        activityHours: journey.activityHours as any,
        budgetLevel: journey.budgetLevel,
        travelStyle: journey.travelStyle,
        curatedContext,
      };

      const aiResult = await this.openAIProvider.generateGuestItinerary(input);

      // Save AIRequest Audit Log
      await this.prisma.aIRequest.create({
        data: {
          guestJourneyId: journey.id,
          provider: aiResult.provider,
          model: aiResult.model,
          prompt: 'Guest System Prompt + Curated Context',
          response: aiResult.parsedData,
          status: 'SUCCESS',
          tokensUsed: aiResult.tokensUsed,
        },
      });

      // Normalize itinerary and add Provenance metadata
      const normalizedDays = (aiResult.parsedData.days || []).map((day: any, idx: number) => ({
        dayNumber: day.dayNumber || idx + 1,
        date: day.date,
        destination: day.destination || (journey.destinations?.[0]?.name ?? 'Destino'),
        title: day.title || `Dia ${idx + 1}`,
        description: day.description || '',
        items: (day.items || []).map((item: any, itemIdx: number) => {
          const categoryMatch = Object.values(ItineraryCategory).find(
            (c) => c === item.category,
          );

          // Provenance resolution
          let sourceType = item.sourceType || 'AI';
          let sourceId = item.sourceId || null;
          let providerPlaceId = item.providerPlaceId || null;

          if (sourceType === 'AI' || !sourceType) {
            if (providerPlaceId) {
              sourceType = 'PLACES';
            }
          }

          return {
            title: item.title || 'Atividade',
            description: item.description || '',
            category: categoryMatch || ItineraryCategory.TOURIST_ATTRACTION,
            location: item.location || '',
            period: item.period || 'Manhã',
            cost: Number(item.estimatedCost || item.cost || 0),
            order: itemIdx + 1,
            sourceType,
            sourceId,
            providerPlaceId,
          };
        }),
      }));

      const normalizedItinerary = {
        days: normalizedDays,
        overallCoverage: curatedContext.overallCoverage,
      };

      await this.prisma.guestJourney.update({
        where: { id: journey.id },
        data: {
          generatedItinerary: normalizedItinerary as any,
          generationCompletedAt: new Date(),
          status: GuestJourneyStatus.PREVIEW_READY,
        },
      });

      this.logger.log(
        `Geração de roteiro anônimo (Coverage: ${curatedContext.overallCoverage}) concluída com sucesso para jornada ${journey.id}`,
      );
    } catch (error) {
      this.logger.error(`Falha na geração de roteiro anônimo para jornada ${journey.id}`, error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na IA';

      await this.prisma.aIRequest.create({
        data: {
          guestJourneyId: journey.id,
          provider: 'OPENAI',
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          prompt: 'Guest System Prompt + Curated Context',
          status: 'FAILED',
          errorMessage,
        },
      }).catch((err) => this.logger.error('Erro ao registrar falha de AIRequest', err));

      await this.prisma.guestJourney.update({
        where: { id: journey.id },
        data: {
          generationFailedAt: new Date(),
          generationErrorCode: 'OPENAI_ERROR',
          status: GuestJourneyStatus.FAILED,
        },
      }).catch((err) => this.logger.error('Erro ao atualizar status FAILED em GuestJourney', err));
    }
  }

  async getAdminAiRequests(page: number, limit: number, filters: any) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.tripId) where.tripId = filters.tripId;
    if (filters.baseTripId) where.baseTripId = filters.baseTripId;
    if (filters.provider) where.provider = filters.provider;
    if (filters.model) where.model = filters.model;

    const [data, total] = await Promise.all([
      this.prisma.aIRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aIRequest.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminAiRequestDetails(id: string) {
    const req = await this.prisma.aIRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        trip: { select: { id: true, title: true, destination: true } },
        baseTrip: { select: { id: true, title: true } },
      },
    });
    if (!req) throw new NotFoundException('AI Request não encontrado');
    return req;
  }
}
