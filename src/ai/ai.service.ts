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
import { PlacesService } from '../places/places.service';
import { estimateTransit } from './transit.util';
import {
  ItineraryCategory,
  GuestJourneyStatus,
  TicketStatus,
  TransitMode,
} from '@prisma/client';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private openAIProvider: OpenAIProvider,
    private curationRetrievalService: CurationRetrievalService,
    private placesService: PlacesService,
  ) {}

  async generateItinerary(userId: string, tripId: string, body: any) {
    const { baseTripId } = body;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { days: true, accommodation: true },
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

    const curatedMap = new Map<string, any>();
    if (baseTrip?.days) {
      for (const day of baseTrip.days) {
        for (const attr of day.attractions || []) {
          if (attr.name) {
            curatedMap.set(attr.name.toLowerCase().trim(), {
              providerPlaceId: attr.providerPlaceId,
              latitude: attr.latitude,
              longitude: attr.longitude,
              requiresTicket: attr.requiresTicket,
              address: attr.address,
              googleMapsLink: attr.googleMapsLink,
            });
          }
        }
        for (const rest of day.restaurants || []) {
          if (rest.name) {
            curatedMap.set(rest.name.toLowerCase().trim(), {
              providerPlaceId: rest.providerPlaceId,
              latitude: rest.latitude,
              longitude: rest.longitude,
              requiresTicket: false,
              address: rest.address,
              googleMapsLink: rest.googleMapsLink,
            });
          }
        }
      }
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

        const placeCache = new Map<string, any>();
        const enrichedDays = await Promise.all(
          parsedDays.map(async (day, index) => {
            let dayDate: Date | null = null;
            if (trip.startDate) {
              const d = new Date(trip.startDate);
              d.setDate(d.getDate() + index);
              dayDate = d;
            } else if (day.date) {
              dayDate = new Date(day.date);
            }

            const enrichedItems = await this.validateAndEnrichDayItems(
              day.items,
              trip.accommodation,
              curatedMap,
              placeCache,
            );

            return {
              dayNumber: day.dayNumber || index + 1,
              date: dayDate,
              title: String(day.title || `Dia ${index + 1}`),
              description: String(day.description || ''),
              items: {
                create: enrichedItems.map((item: any, order: number) => {
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
                    latitude:
                      item.latitude != null ? Number(item.latitude) : null,
                    longitude:
                      item.longitude != null ? Number(item.longitude) : null,
                    providerPlaceId: item.providerPlaceId || null,
                    placeProvider: item.placeProvider || null,
                    transitDistanceMeters: item.transitDistanceMeters ?? null,
                    transitDurationMinutes:
                      item.transitDurationMinutes ?? null,
                    transitMode: item.transitMode || TransitMode.WALKING,
                    ticketStatus: item.ticketStatus || TicketStatus.UNKNOWN,
                    order: order + 1,
                    isEditable: true,
                    isUserModified: false,
                  };
                }),
              },
            };
          }),
        );

        await tx.trip.update({
          where: { id: tripId },
          data: {
            days: {
              create: enrichedDays,
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
    let curatedContext: any = null;
    try {
      const destinations = (journey.destinations as any[]) || [];

      // Phase G2: Retrieve Curated Knowledge Context from PostgreSQL
      curatedContext =
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

      // Identify best base trip and referenced base trips for audit trail
      const referencedBaseTrips = (curatedContext?.destinations || [])
        .map((d: any) =>
          d.bestBaseTrip?.baseTrip
            ? { id: d.bestBaseTrip.baseTrip.id, title: d.bestBaseTrip.baseTrip.title }
            : null,
        )
        .filter(Boolean);
      const bestBaseTripId = referencedBaseTrips[0]?.id || null;

      // Save AIRequest Audit Log
      await this.prisma.aIRequest.create({
        data: {
          guestJourneyId: journey.id,
          baseTripId: bestBaseTripId,
          provider: aiResult.provider,
          model: aiResult.model,
          prompt: referencedBaseTrips.length
            ? `Guest System Prompt + Curated Context (Ref: ${referencedBaseTrips.map((b: any) => b.title).join(', ')})`
            : 'Guest System Prompt + Curated Context',
          response: aiResult.parsedData,
          status: 'SUCCESS',
          tokensUsed: aiResult.tokensUsed,
        },
      });

      // Build curated lookup map from curatedContext
      const curatedMap = new Map<string, any>();
      if (curatedContext?.destinations) {
        for (const destCtx of curatedContext.destinations) {
          for (const attr of destCtx.attractions || []) {
            if (attr.attraction?.name) {
              curatedMap.set(attr.attraction.name.toLowerCase().trim(), {
                providerPlaceId: attr.attraction.providerPlaceId,
                latitude: attr.attraction.latitude,
                longitude: attr.attraction.longitude,
                requiresTicket: attr.attraction.requiresTicket,
                address: attr.attraction.address,
                googleMapsLink: attr.attraction.googleMapsLink,
              });
            }
          }
          for (const rest of destCtx.restaurants || []) {
            if (rest.restaurant?.name) {
              curatedMap.set(rest.restaurant.name.toLowerCase().trim(), {
                providerPlaceId: rest.restaurant.providerPlaceId,
                latitude: rest.restaurant.latitude,
                longitude: rest.restaurant.longitude,
                requiresTicket: false,
                address: rest.restaurant.address,
                googleMapsLink: rest.restaurant.googleMapsLink,
              });
            }
          }
        }
      }

      const placeCache = new Map<string, any>();
      const rawDays = aiResult.parsedData?.days || [];

      // Normalize itinerary and add Provenance metadata + Places & Transit enrichment
      const normalizedDays = await Promise.all(
        rawDays.map(async (day: any, idx: number) => {
          const enrichedDayItems = await this.validateAndEnrichDayItems(
            day.items || [],
            null,
            curatedMap,
            placeCache,
          );

          return {
            dayNumber: day.dayNumber || idx + 1,
            date: day.date,
            destination:
              day.destination || (journey.destinations?.[0]?.name ?? 'Destino'),
            title: day.title || `Dia ${idx + 1}`,
            description: day.description || '',
            items: enrichedDayItems.map((item: any, itemIdx: number) => {
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
                placeProvider: item.placeProvider || null,
                latitude: item.latitude != null ? Number(item.latitude) : null,
                longitude:
                  item.longitude != null ? Number(item.longitude) : null,
                googleMapsLink: item.googleMapsLink || null,
                transitDistanceMeters: item.transitDistanceMeters ?? null,
                transitDurationMinutes: item.transitDurationMinutes ?? null,
                transitMode: item.transitMode || TransitMode.WALKING,
                ticketStatus: item.ticketStatus || TicketStatus.UNKNOWN,
              };
            }),
          };
        }),
      );

      const expectedDays = this.calculateExpectedDays(destinations);

      if (!normalizedDays || normalizedDays.length === 0) {
        throw new Error(
          'Roteiro gerado incompleto: nenhum dia retornado pela IA.',
        );
      }

      if (expectedDays > 0 && normalizedDays.length !== expectedDays) {
        throw new Error(
          `Roteiro gerado com número de dias divergente do pedido: esperado ${expectedDays}, recebido ${normalizedDays.length}.`,
        );
      }

      const hasEmptyDay = normalizedDays.some(
        (d: any) => !d.items || !Array.isArray(d.items) || d.items.length === 0,
      );
      if (hasEmptyDay) {
        throw new Error(
          'Roteiro gerado incompleto: um ou mais dias não possuem atividades.',
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
        `Geração de roteiro anônimo (Coverage: ${curatedContext.overallCoverage}, BaseTrip: ${bestBaseTripId || 'None'}) concluída com sucesso para jornada ${journey.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Falha na geração de roteiro anônimo para jornada ${journey.id}`,
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido na IA';

      // Identify referenced base trips in error path too
      const bestBaseTripId =
        curatedContext?.destinations?.find((d: any) => d.bestBaseTrip)?.bestBaseTrip?.baseTrip?.id || null;

      await this.prisma.aIRequest
        .create({
          data: {
            guestJourneyId: journey.id,
            baseTripId: bestBaseTripId,
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
        include: {
          user: { select: { id: true, email: true, fullName: true } },
          trip: { select: { id: true, title: true, destination: true } },
          baseTrip: { select: { id: true, title: true } },
        },
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

  private async validateAndEnrichDayItems(
    rawItems: any[],
    accommodation?: { latitude?: number | null; longitude?: number | null } | null,
    curatedMap?: Map<string, any>,
    placeCache?: Map<string, any>,
  ): Promise<any[]> {
    const items = [...(rawItems || [])];
    const enrichedItems: any[] = [];

    for (const item of items) {
      const titleLower = (item.title || '').toLowerCase().trim();
      const curated = curatedMap?.get(titleLower);

      let providerPlaceId =
        item.providerPlaceId || curated?.providerPlaceId || null;
      let placeProvider =
        item.placeProvider || (providerPlaceId ? 'GOOGLE' : null);
      let latitude =
        item.latitude != null
          ? Number(item.latitude)
          : curated?.latitude != null
            ? Number(curated.latitude)
            : null;
      let longitude =
        item.longitude != null
          ? Number(item.longitude)
          : curated?.longitude != null
            ? Number(curated.longitude)
            : null;
      let location = item.location || curated?.address || '';
      let googleMapsLink =
        item.googleMapsLink || curated?.googleMapsLink || null;

      // Validate providerPlaceId via PlacesService / cache before persisting
      if (providerPlaceId) {
        let details: any = null;
        if (placeCache && placeCache.has(providerPlaceId)) {
          details = placeCache.get(providerPlaceId);
        } else {
          try {
            details = await this.placesService.getPlaceDetails(providerPlaceId);
            if (placeCache) placeCache.set(providerPlaceId, details);
          } catch (err: any) {
            this.logger.warn(
              `Provider place ID "${providerPlaceId}" para "${item.title}" inválido ou não encontrado: ${err.message}. Descartando fake place ID.`,
            );
            details = null;
            if (placeCache) placeCache.set(providerPlaceId, null);
          }
        }

        if (details) {
          placeProvider = 'GOOGLE';
          if (details.latitude != null && details.longitude != null) {
            latitude = details.latitude;
            longitude = details.longitude;
          }
          if (
            details.formattedAddress &&
            (!location || location === 'Destino')
          ) {
            location = details.formattedAddress;
          }
          if (details.googleMapsUri && !googleMapsLink) {
            googleMapsLink = details.googleMapsUri;
          }
        } else {
          // FAKE_PLACE_ID_NOT_STORED = YES
          providerPlaceId = null;
          placeProvider = null;
          latitude = null;
          longitude = null;
        }
      }

      // Ticket Status determination
      let ticketStatus: TicketStatus = TicketStatus.UNKNOWN;
      if (curated) {
        if (curated.requiresTicket === true) {
          ticketStatus = TicketStatus.TICKET_REQUIRED;
        } else if (
          curated.requiresTicket === false &&
          (curated.cost === 0 || curated.cost == null)
        ) {
          ticketStatus = TicketStatus.FREE;
        }
      }

      if (ticketStatus === TicketStatus.UNKNOWN) {
        const categoryMatch = Object.values(ItineraryCategory).find(
          (c) => c === item.category,
        );
        const textToCheck =
          `${item.title || ''} ${item.description || ''} ${item.notes || ''}`.toLowerCase();

        if (
          categoryMatch === ItineraryCategory.MUSEUM ||
          textToCheck.includes('ingresso') ||
          textToCheck.includes('ticket') ||
          textToCheck.includes('entrada paga') ||
          textToCheck.includes('bilhete') ||
          (Number(item.cost ?? item.estimatedCost) > 0 &&
            categoryMatch === ItineraryCategory.TOURIST_ATTRACTION)
        ) {
          ticketStatus = TicketStatus.TICKET_REQUIRED;
        } else if (
          categoryMatch === ItineraryCategory.PARK ||
          categoryMatch === ItineraryCategory.BEACH ||
          categoryMatch === ItineraryCategory.RESTAURANT ||
          categoryMatch === ItineraryCategory.CAFE ||
          categoryMatch === ItineraryCategory.BAR ||
          textToCheck.includes('entrada livre') ||
          textToCheck.includes('gratuito') ||
          textToCheck.includes('grátis') ||
          textToCheck.includes('gratis') ||
          textToCheck.includes('acesso livre')
        ) {
          ticketStatus = TicketStatus.FREE;
        } else {
          ticketStatus = TicketStatus.UNKNOWN;
        }
      }

      enrichedItems.push({
        ...item,
        location,
        googleMapsLink,
        latitude,
        longitude,
        providerPlaceId,
        placeProvider,
        ticketStatus,
      });
    }

    // Transit Calculation (Haversine geodesic estimate; do not invent meters if coords null)
    for (let i = 0; i < enrichedItems.length; i++) {
      const current = enrichedItems[i];
      if (i === 0) {
        if (
          accommodation &&
          accommodation.latitude != null &&
          accommodation.longitude != null &&
          current.latitude != null &&
          current.longitude != null
        ) {
          const transit = estimateTransit(
            accommodation.latitude,
            accommodation.longitude,
            current.latitude,
            current.longitude,
          );
          current.transitDistanceMeters = transit.transitDistanceMeters;
          current.transitDurationMinutes = transit.transitDurationMinutes;
          current.transitMode = transit.transitMode;
        } else {
          current.transitDistanceMeters = null;
          current.transitDurationMinutes = null;
          current.transitMode = TransitMode.WALKING;
        }
      } else {
        const prev = enrichedItems[i - 1];
        if (
          prev.latitude != null &&
          prev.longitude != null &&
          current.latitude != null &&
          current.longitude != null
        ) {
          const transit = estimateTransit(
            prev.latitude,
            prev.longitude,
            current.latitude,
            current.longitude,
          );
          current.transitDistanceMeters = transit.transitDistanceMeters;
          current.transitDurationMinutes = transit.transitDurationMinutes;
          current.transitMode = transit.transitMode;
        } else {
          current.transitDistanceMeters = null;
          current.transitDurationMinutes = null;
          current.transitMode = TransitMode.WALKING;
        }
      }
    }

    return enrichedItems;
  }

  private calculateExpectedDays(destinations: any[]): number {
    let days = 0;
    for (const d of destinations || []) {
      if (d.numberOfDays && Number(d.numberOfDays) > 0) {
        days += Number(d.numberOfDays);
      } else if (d.days && Number(d.days) > 0) {
        days += Number(d.days);
      } else if (d.arrivalDate && d.departureDate) {
        const start = new Date(d.arrivalDate).getTime();
        const end = new Date(d.departureDate).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const diff = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
          days += Math.max(1, diff);
        }
      }
    }
    return days;
  }
}
