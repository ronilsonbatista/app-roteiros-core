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
      if (!baseTrip || baseTrip.status !== 'PUBLISHED')
        throw new NotFoundException('Roteiro base publicado não encontrado');
    }

    const numberOfDays =
      trip.endDate && trip.startDate
        ? Math.ceil(
            (new Date(trip.endDate).getTime() -
              new Date(trip.startDate).getTime()) /
              (1000 * 3600 * 24),
          ) + 1
        : baseTrip?.numberOfDays || 3;

    if (
      !Number.isInteger(numberOfDays) ||
      numberOfDays < 1 ||
      numberOfDays > 30
    )
      throw new BadRequestException('A geração aceita viagens de 1 a 30 dias.');
    if (!baseTrip) {
      const curated =
        await this.curationRetrievalService.retrieveCuratedContext({
          destinations: [{ name: trip.destination }],
          numberOfDays,
          interests: travelProfile?.travelInterests || [],
        });
      baseTrip = curated.destinations[0]?.bestBaseTrip?.baseTrip || null;
    }

    let aiRequestRecord;

    try {
      const aiResult = await this.openAIProvider.generateItinerary({
        destination: trip.destination,
        numberOfDays,
        travelProfile: {
          ...travelProfile,
          tripPreferences: trip.preferences,
          destinations: (trip.preferences as any)?.destinations,
        },
        destinations: (trip.preferences as any)?.destinations,
        baseTrip,
      });

      const parsedDays = aiResult.parsedData?.days;
      if (
        !Array.isArray(parsedDays) ||
        parsedDays.length !== numberOfDays ||
        parsedDays.some(
          (day) =>
            !Array.isArray(day.items) ||
            !day.items.length ||
            day.items.length > 30 ||
            day.items.some(
              (item: { title?: unknown }) =>
                typeof item.title !== 'string' || !item.title.trim(),
            ),
        )
      ) {
        throw new BadRequestException(
          'A IA retornou um roteiro incompleto. Nenhum dia foi salvo.',
        );
      }
      aiRequestRecord = await this.prisma.$transaction(async (tx) => {
        const current = await tx.trip.findUnique({
          where: { id: tripId },
          include: { days: true },
        });
        if (
          !current ||
          current.days.length ||
          current.updatedAt.getTime() !== trip.updatedAt.getTime()
        )
          throw new BadRequestException(
            'O roteiro foi alterado durante a geração. Atualize antes de tentar novamente.',
          );
        await tx.trip.update({
          where: { id: tripId },
          data: {
            days: {
              create: parsedDays.map((day, index) => {
                let dayDate: Date | null = null;
                if (trip.startDate) {
                  const d = new Date(trip.startDate);
                  d.setDate(d.getDate() + index);
                  dayDate = d;
                } else if (day.date) {
                  dayDate = new Date(day.date);
                }

                return {
                  dayNumber: day.dayNumber || index + 1,
                  date: dayDate,
                  title: String(day.title || `Dia ${index + 1}`),
                  description: String(day.description || ''),
                  items: {
                    create: day.items.map((item: any, order: number) => {
                      const categoryMatch =
                        Object.values(ItineraryCategory).find(
                          (c) => c === item.category,
                        ) || ItineraryCategory.TOURIST_ATTRACTION;

                      return {
                        title: String(item.title || 'Atividade'),
                        description: String(item.description || ''),
                        category: categoryMatch,
                        location: String(item.location || ''),
                        period: String(item.period || ''),
                        timeLabel: item.timeLabel
                          ? String(item.timeLabel)
                          : null,
                        duration: Number.isFinite(Number(item.duration))
                          ? Number(item.duration)
                          : null,
                        cost: Number.isFinite(
                          Number(item.cost ?? item.estimatedCost),
                        )
                          ? Math.max(0, Number(item.cost ?? item.estimatedCost))
                          : 0,
                        currency: String(item.currency || 'EUR'),
                        notes: item.notes ? String(item.notes) : null,
                        googleMapsLink: item.googleMapsLink
                          ? String(item.googleMapsLink)
                          : null,
                        order: order + 1,
                        isEditable: true,
                        isUserModified: false,
                      };
                    }),
                  },
                };
              }),
            },
          },
        });
        return tx.aIRequest.create({
          data: {
            userId,
            tripId,
            baseTripId: baseTrip?.id,
            provider: aiResult.provider,
            model: aiResult.model,
            prompt: 'Perfil e preferências + roteiro base publicado',
            response: aiResult.parsedData,
            status: 'SUCCESS',
            tokensUsed: aiResult.tokensUsed,
          },
        });
      });

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
      const curatedContext =
        await this.curationRetrievalService.retrieveCuratedContext({
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
          travelers: (journey.travelers as any) || {
            adults: 1,
            children: 0,
            elders: 0,
          },
          travelStyle: journey.travelStyle,
        });

      const input = {
        journeyId: journey.id,
        destinations,
        travelers: (journey.travelers as any) || {
          adults: 1,
          children: 0,
          elders: 0,
        },
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
      const normalizedDays = (aiResult.parsedData.days || []).map(
        (day: any, idx: number) => ({
          dayNumber: day.dayNumber || idx + 1,
          date: day.date,
          destination:
            day.destination || (journey.destinations?.[0]?.name ?? 'Destino'),
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
              timeLabel: item.timeLabel || null,
              duration: Number.isFinite(Number(item.duration))
                ? Number(item.duration)
                : null,
              cost: Number(item.cost ?? item.estimatedCost ?? 0),
              currency: item.currency || 'EUR',
              notes: item.notes || '',
              order: itemIdx + 1,
              sourceType,
              sourceId,
              providerPlaceId,
            };
          }),
        }),
      );

      if (
        !normalizedDays ||
        normalizedDays.length === 0 ||
        normalizedDays.every((d: any) => !d.items || d.items.length === 0)
      ) {
        throw new Error(
          'Roteiro gerado incompleto: nenhum dia ou atividade válida retornada pela IA.',
        );
      }

      const normalizedItinerary = {
        days: normalizedDays,
        overallCoverage: curatedContext.overallCoverage,
      };

      await this.prisma.guestJourney.updateMany({
        where: {
          id: journey.id,
          status: GuestJourneyStatus.GENERATING,
        },
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
      this.logger.error(
        `Falha na geração de roteiro anônimo para jornada ${journey.id}`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido na IA';

      await this.prisma.aIRequest
        .create({
          data: {
            guestJourneyId: journey.id,
            provider: 'OPENAI',
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            prompt: 'Guest System Prompt + Curated Context',
            status: 'FAILED',
            errorMessage,
          },
        })
        .catch((err) =>
          this.logger.error('Erro ao registrar falha de AIRequest', err),
        );

      // CAS: Only mark FAILED if still in GENERATING state (late error cannot overwrite PREVIEW_READY or CLAIMED)
      await this.prisma.guestJourney
        .updateMany({
          where: {
            id: journey.id,
            status: GuestJourneyStatus.GENERATING,
          },
          data: {
            generationFailedAt: new Date(),
            generationErrorCode: 'OPENAI_ERROR',
            status: GuestJourneyStatus.FAILED,
          },
        })
        .catch((err) =>
          this.logger.error(
            'Erro ao atualizar status FAILED em GuestJourney',
            err,
          ),
        );
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
