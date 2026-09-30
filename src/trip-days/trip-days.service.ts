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
    const item = await this.prisma.itineraryItem.create({
      data: {
        ...dto,
        tripDayId: dayId,
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
          baseRestaurants.push({
            name: rest.name,
            cuisineType: rest.cuisineType,
            priceRange: rest.priceRange,
            priceLevel: rest.priceLevel,
            recommendedDish: rest.recommendedDish,
            address: rest.address,
            providerPlaceId: rest.providerPlaceId || null,
            latitude: rest.latitude || null,
            longitude: rest.longitude || null,
            rating: rest.rating,
            source: 'BASE_TRIP',
          });
        }
      }
    }

    // Google Places Search
    let placesRestaurants: any[] = [];
    try {
      const query = period
        ? `${period} restaurantes em ${destination}`
        : `melhores restaurantes em ${destination}`;
      const places = await this.placesService.searchPlaces(query);
      placesRestaurants = places.map((p) => ({
        name: p.name,
        cuisineType: p.types?.slice(0, 3).join(', ') || 'Culinária local',
        priceRange: p.priceLevel ? '€'.repeat(p.priceLevel) : '€€',
        priceLevel: p.priceLevel,
        recommendedDish: null,
        address: p.formattedAddress,
        providerPlaceId: p.providerPlaceId,
        latitude: p.latitude || null,
        longitude: p.longitude || null,
        rating: p.rating,
        userRatingsTotal: p.userRatingsTotal,
        googleMapsUri: p.googleMapsUri,
        source: 'PLACES',
      }));
    } catch {
      placesRestaurants = [];
    }

    const uniqueNames = new Set<string>();
    const recommendations: any[] = [];

    for (const item of [...baseRestaurants, ...placesRestaurants]) {
      const key = item.name.toLowerCase().trim();
      if (!uniqueNames.has(key)) {
        uniqueNames.add(key);
        recommendations.push(item);
      }
    }

    return {
      destination,
      period: period || 'Geral',
      recommendations,
    };
  }
}
