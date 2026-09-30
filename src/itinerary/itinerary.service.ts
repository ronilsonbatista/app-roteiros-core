import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from './dto/reorder-itinerary-item.dto';
import { SubstituteItemDto } from './dto/substitute-item.dto';
import { PinMealDto } from './dto/pin-meal.dto';
import { isTripLocked } from '../trips/trips.util';
import {
  BaseTripStatus,
  ItineraryCategory,
  Role,
  TicketStatus,
} from '@prisma/client';
import {
  recalculateDayTimeLabels,
  recalculateDayTransits,
} from '../trips/itinerary-schedule.util';

@Injectable()
export class ItineraryService {
  constructor(
    private prisma: PrismaService,
    private placesService: PlacesService,
  ) {}

  async findOneWithAuth(user: any, itemId: string) {
    const userId = typeof user === 'string' ? user : user?.userId;
    const role = typeof user === 'string' ? undefined : user?.role;

    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        tripDay: {
          include: {
            trip: {
              include: {
                createdFromGuestJourneys: true,
                purchases: true,
                accommodation: true,
              },
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    const isOwner = item.tripDay.trip.userId === userId;
    const isAdmin = role === 'ADMIN' || role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Acesso negado');
    }

    if (
      !isAdmin &&
      isTripLocked(item.tripDay.trip) &&
      item.tripDay.dayNumber > 1
    ) {
      throw new ForbiddenException(
        'O acesso e alteração de itens a partir do Dia 2 requer confirmação de pagamento.',
      );
    }

    return item;
  }

  async findOne(user: any, itemId: string) {
    const item = await this.findOneWithAuth(user, itemId);

    let verifiedDetails: any = null;
    if (item.providerPlaceId) {
      try {
        const details = await this.placesService.getPlaceDetails(
          item.providerPlaceId,
        );
        if (details) {
          verifiedDetails = {
            name: details.name,
            formattedAddress: details.formattedAddress,
            rating: details.rating,
            userRatingsTotal: details.userRatingsTotal,
            googleMapsUri: details.googleMapsUri,
            websiteUri: details.websiteUri,
            internationalPhoneNumber: details.internationalPhoneNumber,
            priceLevel: details.priceLevel,
            types: details.types,
          };
        }
      } catch {
        verifiedDetails = null;
      }
    }

    return {
      ...item,
      verifiedDetails,
    };
  }

  async update(user: any, itemId: string, dto: UpdateItineraryItemDto) {
    const current = await this.findOneWithAuth(user, itemId);

    const updated = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        isUserModified: true,
      },
    });

    // If duration was updated, recalculate timeLabels for subsequent items
    if (dto.duration !== undefined && dto.duration !== current.duration) {
      await recalculateDayTimeLabels(current.tripDayId, this.prisma);
    }

    // If coordinates or location changed, recalculate transits
    if (
      dto.latitude !== undefined ||
      dto.longitude !== undefined ||
      dto.location !== undefined
    ) {
      await recalculateDayTransits(current.tripDayId, this.prisma);
    }

    return this.prisma.itineraryItem.findUnique({ where: { id: itemId } });
  }

  async remove(user: any, itemId: string) {
    const item = await this.findOneWithAuth(user, itemId);
    const tripDayId = item.tripDayId;

    const result = await this.prisma.itineraryItem.delete({
      where: { id: itemId },
    });

    await recalculateDayTransits(tripDayId, this.prisma);
    await recalculateDayTimeLabels(tripDayId, this.prisma);

    return result;
  }

  async reorder(user: any, itemId: string, dto: ReorderItineraryItemDto) {
    const item = await this.findOneWithAuth(user, itemId);
    const updated = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: { order: dto.order },
    });

    await recalculateDayTransits(item.tripDayId, this.prisma);
    await recalculateDayTimeLabels(item.tripDayId, this.prisma);

    return updated;
  }

  async getAlternatives(user: any, itemId: string) {
    const item = await this.findOneWithAuth(user, itemId);
    const trip = item.tripDay.trip;

    const allowedSwapsCount = trip.allowedSwapsCount ?? 4;
    const usedSwapsCount = trip.usedSwapsCount ?? 0;
    const remainingSwaps = Math.max(0, allowedSwapsCount - usedSwapsCount);

    const dayItems = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: item.tripDayId },
    });
    const existingTitles = new Set(
      dayItems.map((i) => i.title.toLowerCase().trim()),
    );

    const isFood = [
      ItineraryCategory.RESTAURANT,
      ItineraryCategory.CAFE,
      ItineraryCategory.BAR,
    ].includes(item.category as any);

    const baseTrips = await this.prisma.baseTrip.findMany({
      where: {
        status: BaseTripStatus.PUBLISHED,
        OR: [
          { destination: { contains: trip.destination, mode: 'insensitive' } },
          { city: { contains: trip.destination, mode: 'insensitive' } },
        ],
      },
      include: {
        days: {
          include: {
            attractions: true,
            restaurants: true,
          },
        },
      },
    });

    const baseCandidates: any[] = [];
    for (const bt of baseTrips) {
      for (const d of bt.days || []) {
        if (isFood) {
          for (const rest of d.restaurants || []) {
            if (!existingTitles.has(rest.name.toLowerCase().trim())) {
              baseCandidates.push({
                title: rest.name,
                category: ItineraryCategory.RESTAURANT,
                description: rest.notes || rest.recommendedDish || null,
                location: rest.address || trip.destination,
                providerPlaceId: rest.providerPlaceId || null,
                latitude: rest.latitude || null,
                longitude: rest.longitude || null,
                cost: rest.priceLevel ? rest.priceLevel * 20 : 0,
                currency: 'EUR',
                duration: 90,
                ticketStatus: TicketStatus.FREE,
                source: 'BASE_TRIP',
              });
            }
          }
        } else {
          for (const attr of d.attractions || []) {
            if (!existingTitles.has(attr.name.toLowerCase().trim())) {
              baseCandidates.push({
                title: attr.name,
                category: attr.category || item.category,
                description: attr.shortDescription || attr.fullDescription || null,
                location: attr.address || trip.destination,
                providerPlaceId: attr.providerPlaceId || null,
                latitude: attr.latitude || null,
                longitude: attr.longitude || null,
                cost: attr.cost || 0,
                currency: attr.currency || 'EUR',
                duration: attr.duration || 60,
                ticketStatus: attr.requiresTicket
                  ? TicketStatus.TICKET_REQUIRED
                  : TicketStatus.FREE,
                source: 'BASE_TRIP',
              });
            }
          }
        }
      }
    }

    // Google Places Search
    let placesCandidates: any[] = [];
    try {
      const places = await this.placesService.searchPlaces(
        `${item.category} ${trip.destination}`,
      );
      placesCandidates = places.map((p) => ({
        title: p.name,
        category: item.category,
        description: null,
        location: p.formattedAddress,
        providerPlaceId: p.providerPlaceId,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        cost: p.priceLevel ? p.priceLevel * 15 : 0,
        currency: 'EUR',
        duration: isFood ? 90 : 60,
        rating: p.rating,
        userRatingsTotal: p.userRatingsTotal,
        googleMapsUri: p.googleMapsUri,
        ticketStatus: TicketStatus.UNKNOWN,
        source: 'PLACES',
      }));
    } catch {
      placesCandidates = [];
    }

    const items = [...baseCandidates, ...placesCandidates].filter(
      (c) => !existingTitles.has(c.title.toLowerCase().trim()),
    );

    return {
      items,
      quota: {
        allowedSwapsCount,
        usedSwapsCount,
        remainingSwaps,
      },
    };
  }

  async substitute(user: any, itemId: string, dto: SubstituteItemDto) {
    const item = await this.findOneWithAuth(user, itemId);
    const trip = item.tripDay.trip;

    const allowed = trip.allowedSwapsCount ?? 4;
    const used = trip.usedSwapsCount ?? 0;

    if (used >= allowed) {
      throw new BadRequestException(
        `Cota de trocas esgotada (${used}/${allowed}). Não é possível realizar mais substituições nesta viagem.`,
      );
    }

    // Validate providerPlaceId if passed
    let validatedPlaceId = dto.providerPlaceId || null;
    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;
    let location = dto.location ?? item.location;

    if (validatedPlaceId) {
      try {
        const details =
          await this.placesService.getPlaceDetails(validatedPlaceId);
        if (details) {
          validatedPlaceId = details.providerPlaceId || validatedPlaceId;
          if (details.latitude != null && details.longitude != null) {
            latitude = details.latitude;
            longitude = details.longitude;
          }
          if (details.formattedAddress && !location) {
            location = details.formattedAddress;
          }
        } else {
          validatedPlaceId = null;
        }
      } catch {
        // Strip fake place ID
        validatedPlaceId = null;
      }
    }

    let ticketStatus = dto.ticketStatus || TicketStatus.UNKNOWN;
    if (dto.category === ItineraryCategory.MUSEUM) {
      ticketStatus = TicketStatus.TICKET_REQUIRED;
    } else if (
      dto.category === ItineraryCategory.PARK ||
      dto.category === ItineraryCategory.BEACH ||
      dto.category === ItineraryCategory.RESTAURANT ||
      dto.category === ItineraryCategory.CAFE
    ) {
      ticketStatus = TicketStatus.FREE;
    }

    await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { usedSwapsCount: used + 1 },
      }),
      this.prisma.itineraryItem.update({
        where: { id: itemId },
        data: {
          title: dto.title,
          description: dto.description ?? item.description,
          category: dto.category ?? item.category,
          location,
          providerPlaceId: validatedPlaceId,
          placeProvider: validatedPlaceId ? 'GOOGLE' : null,
          latitude,
          longitude,
          cost: dto.cost ?? item.cost,
          currency: dto.currency ?? item.currency,
          duration: dto.duration ?? item.duration,
          ticketStatus,
          isUserModified: true,
        },
      }),
    ]);

    await recalculateDayTransits(item.tripDayId, this.prisma);
    await recalculateDayTimeLabels(item.tripDayId, this.prisma);

    const updatedItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });

    return {
      item: updatedItem,
      quota: {
        allowedSwapsCount: allowed,
        usedSwapsCount: used + 1,
        remainingSwaps: Math.max(0, allowed - (used + 1)),
      },
    };
  }

  async pinMeal(user: any, itemId: string, dto: PinMealDto) {
    const item = await this.findOneWithAuth(user, itemId);

    let validatedPlaceId = dto.providerPlaceId || null;
    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;
    let location = dto.location ?? item.location;

    if (validatedPlaceId) {
      try {
        const details =
          await this.placesService.getPlaceDetails(validatedPlaceId);
        if (details) {
          validatedPlaceId = details.providerPlaceId || validatedPlaceId;
          if (details.latitude != null && details.longitude != null) {
            latitude = details.latitude;
            longitude = details.longitude;
          }
          if (details.formattedAddress && !location) {
            location = details.formattedAddress;
          }
        } else {
          validatedPlaceId = null;
        }
      } catch {
        validatedPlaceId = null;
      }
    }

    const updated = await this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        title: dto.title,
        description: dto.description ?? item.description,
        location,
        providerPlaceId: validatedPlaceId,
        placeProvider: validatedPlaceId ? 'GOOGLE' : null,
        latitude,
        longitude,
        cost: dto.cost ?? item.cost,
        currency: dto.currency ?? item.currency,
        notes: dto.notes ?? item.notes,
        googleMapsLink: dto.googleMapsLink ?? item.googleMapsLink,
        category: ItineraryCategory.RESTAURANT,
        ticketStatus: TicketStatus.FREE,
        isUserModified: true,
      },
    });

    await recalculateDayTransits(item.tripDayId, this.prisma);
    await recalculateDayTimeLabels(item.tripDayId, this.prisma);

    const finalItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });

    return {
      message: 'Refeição fixada com sucesso',
      item: finalItem,
    };
  }
}
