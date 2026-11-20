import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { UpdateTripDayDto } from './dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';
import { isTripLocked } from '../trips/trips.util';
import { BaseTripStatus, Role } from '@prisma/client';
import {
  recalculateDayTransits,
  recalculateDayTimeLabels,
} from '../trips/itinerary-schedule.util';
import { priceLevelToDisplay } from '../places/providers/places-provider.interface';

@Injectable()
export class TripDaysService {
  constructor(
    private prisma: PrismaService,
    private placesService: PlacesService,
  ) {}

  async findOneWithAuth(user: any, dayId: string) {
    const userId = typeof user === 'string' ? user : user?.userId;
    const role = typeof user === 'string' ? undefined : user?.role;

    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: dayId },
      include: {
        trip: {
          include: { createdFromGuestJourneys: true, purchases: true },
        },
      },
    });

    if (!tripDay) throw new NotFoundException('Dia não encontrado');

    const isOwner = tripDay.trip.userId === userId;
    const isAdmin = role === 'ADMIN' || role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Acesso negado');
    }

    if (!isAdmin && isTripLocked(tripDay.trip) && tripDay.dayNumber > 1) {
      throw new ForbiddenException(
        'O acesso e alteração de itens a partir do Dia 2 requer confirmação de pagamento.',
      );
    }

    return tripDay;
  }

  async update(user: any, dayId: string, dto: UpdateTripDayDto) {
    await this.findOneWithAuth(user, dayId);
    return this.prisma.tripDay.update({
      where: { id: dayId },
      data: dto,
    });
  }

  async remove(user: any, dayId: string) {
    await this.findOneWithAuth(user, dayId);
    return this.prisma.tripDay.delete({
      where: { id: dayId },
    });
  }

  async createItem(user: any, dayId: string, dto: CreateItineraryItemDto) {
    await this.findOneWithAuth(user, dayId);

    let providerPlaceId = dto.providerPlaceId?.trim() || null;
    let placeProvider = dto.placeProvider?.trim() || null;
    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;
    let location = dto.location ?? null;
    let googleMapsLink = dto.googleMapsLink ?? null;

    if (providerPlaceId) {
      try {
        const details =
          await this.placesService.getPlaceDetails(providerPlaceId);
        if (details) {
          providerPlaceId = details.providerPlaceId || providerPlaceId;
          placeProvider = placeProvider || 'GOOGLE';
          if (details.latitude != null && details.longitude != null) {
            latitude = details.latitude;
            longitude = details.longitude;
          }
          if (details.formattedAddress && !location) {
            location = details.formattedAddress;
          }
          if (details.googleMapsUri && !googleMapsLink) {
            googleMapsLink = details.googleMapsUri;
          }
        } else {
          providerPlaceId = null;
          placeProvider = null;
        }
      } catch {
        providerPlaceId = null;
        placeProvider = null;
      }
    }

    const { providerPlaceId: _p, placeProvider: _pp, ...rest } = dto;
    const item = await this.prisma.itineraryItem.create({
      data: {
        ...rest,
        location: location ?? undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        googleMapsLink: googleMapsLink ?? undefined,
        providerPlaceId,
        placeProvider,
        tripDayId: dayId,
        isUserModified: true,
      },
    });

    await recalculateDayTransits(dayId, this.prisma);
    await recalculateDayTimeLabels(dayId, this.prisma);

    return item;
  }

  async getMealRecommendations(user: any, dayId: string, period?: string) {
    const tripDay = await this.findOneWithAuth(user, dayId);
    const trip = tripDay.trip;
    const destination = trip.destination;
    const normalizedPeriod = normalizeMealPeriod(period);

    const baseTrips = await this.prisma.baseTrip.findMany({
      where: {
        status: BaseTripStatus.PUBLISHED,
        OR: [
          { destination: { contains: destination, mode: 'insensitive' } },
          { city: { contains: destination, mode: 'insensitive' } },
        ],
      },
      include: {
        days: {
          include: { restaurants: true },
        },
      },
    });

    const baseRestaurants: any[] = [];
    for (const bt of baseTrips) {
      for (const d of bt.days || []) {
        for (const rest of d.restaurants || []) {
          const priceRange =
            rest.priceRange ||
            priceLevelToDisplay(rest.priceLevel) ||
            null;
          baseRestaurants.push({
            name: rest.name,
            cuisineType: rest.cuisineType,
            priceRange,
            priceLevel: rest.priceLevel,
            recommendedDish: rest.recommendedDish,
            address: rest.address,
            providerPlaceId: rest.providerPlaceId || null,
            latitude: rest.latitude || null,
            longitude: rest.longitude || null,
            rating: rest.rating,
            userRatingsTotal: null,
            googleMapsUri: rest.googleMapsLink || null,
            imageUrl: rest.image || null,
            openingHours: rest.openingHours || null,
            source: 'BASE_TRIP',
          });
        }
      }
    }

    // Google Places Search (restaurant text query; enrich top hits for photo/hours)
    let placesRestaurants: any[] = [];
    try {
      const mealQuery = mealPlacesQuery(normalizedPeriod, destination);
      const places = await this.placesService.searchPlaces(mealQuery);
      const mapped = places.map((p) => ({
        name: p.name,
        cuisineType: cuisineFromTypes(p.types),
        priceRange: p.priceLevelDisplay || priceLevelToDisplay(p.priceLevel) || null,
        priceLevel: p.priceLevel,
        recommendedDish: null,
        address: p.formattedAddress,
        providerPlaceId: p.providerPlaceId,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        rating: p.rating,
        userRatingsTotal: p.userRatingsTotal,
        googleMapsUri: p.googleMapsUri,
        imageUrl: null as string | null,
        openingHours: null as string | null,
        source: 'PLACES',
      }));

      const enrichLimit = Math.min(mapped.length, 8);
      const enriched = await Promise.all(
        mapped.slice(0, enrichLimit).map(async (item) => {
          if (!item.providerPlaceId) return item;
          try {
            const details = await this.placesService.getPlaceDetails(
              item.providerPlaceId,
            );
            if (!details) return item;
            const photo = details.photos?.find((p) => p.photoUri)?.photoUri;
            return {
              ...item,
              cuisineType:
                details.primaryTypeDisplayName ||
                cuisineFromTypes(details.types) ||
                item.cuisineType,
              priceRange:
                details.priceLevelDisplay ||
                priceLevelToDisplay(details.priceLevel) ||
                item.priceRange,
              priceLevel: details.priceLevel ?? item.priceLevel,
              address: details.formattedAddress || item.address,
              rating: details.rating ?? item.rating,
              userRatingsTotal:
                details.userRatingsTotal ?? item.userRatingsTotal,
              googleMapsUri: details.googleMapsUri || item.googleMapsUri,
              imageUrl: photo || null,
              openingHours: details.openingHoursText || null,
              latitude: details.latitude ?? item.latitude,
              longitude: details.longitude ?? item.longitude,
            };
          } catch {
            return item;
          }
        }),
      );
      placesRestaurants = [...enriched, ...mapped.slice(enrichLimit)];
    } catch {
      placesRestaurants = [];
    }

    const uniqueNames = new Set<string>();
    const recommendations: any[] = [];

    for (const item of [...baseRestaurants, ...placesRestaurants]) {
      const key = (item.name || '').toLowerCase().trim();
      if (!key || uniqueNames.has(key)) continue;
      uniqueNames.add(key);
      recommendations.push(item);
    }

    return {
      destination,
      period: normalizedPeriod || period || 'Geral',
      recommendations,
    };
  }
}

/** Normalize Café / Almoço / Jantar (and English aliases) for Places queries. */
function normalizeMealPeriod(period?: string): string | undefined {
  if (!period?.trim()) return undefined;
  const raw = period.trim().toLowerCase();
  if (
    raw.includes('café') ||
    raw.includes('cafe') ||
    raw.includes('manhã') ||
    raw.includes('manha') ||
    raw.includes('breakfast')
  ) {
    return 'Café';
  }
  if (raw.includes('almoço') || raw.includes('almoco') || raw.includes('lunch')) {
    return 'Almoço';
  }
  if (raw.includes('jantar') || raw.includes('dinner') || raw.includes('noite')) {
    return 'Jantar';
  }
  if (raw === 'geral' || raw === 'tarde' || raw === 'pausa') return undefined;
  return period.trim();
}

function mealPlacesQuery(period: string | undefined, destination: string): string {
  switch (period) {
    case 'Café':
      return `cafés e cafés da manhã em ${destination}`;
    case 'Almoço':
      return `restaurantes para almoço em ${destination}`;
    case 'Jantar':
      return `restaurantes para jantar em ${destination}`;
    default:
      return `melhores restaurantes em ${destination}`;
  }
}

function cuisineFromTypes(types?: string[]): string {
  if (!types?.length) return 'Culinária local';
  const skip = new Set([
    'restaurant',
    'food',
    'point_of_interest',
    'establishment',
    'cafe',
    'bar',
  ]);
  const labels = types
    .filter((t) => !skip.has(t.toLowerCase()))
    .slice(0, 3)
    .map((t) => t.replace(/_/g, ' '));
  return labels.length ? labels.join(', ') : 'Culinária local';
}
