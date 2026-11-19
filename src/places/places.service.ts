import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { isTripLocked } from '../trips/trips.util';

export type PlaceIconKind = 'city' | 'region' | 'country' | 'place';

export function placeIconKind(types: string[] = []): PlaceIconKind {
  if (types.includes('country')) return 'country';
  if (types.includes('locality') || types.includes('sublocality'))
    return 'city';
  if (types.some((t) => t.startsWith('administrative_area_level_')))
    return 'region';
  return 'place';
}

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placesProvider: GooglePlacesProvider,
  ) {}

  async searchPlaces(query: string) {
    return this.placesProvider.searchPlaces(query);
  }

  async searchHotels(
    rawQuery: string,
    bias?: { lat?: number; lng?: number; radiusMeters?: number },
  ) {
    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return { items: [] };

    const locationBias =
      bias?.lat != null && bias?.lng != null
        ? {
            latitude: bias.lat,
            longitude: bias.lng,
            radiusMeters: bias.radiusMeters,
          }
        : undefined;

    const places = await this.placesProvider.searchPlaces(q, {
      includedType: 'lodging',
      locationBias,
    });

    return {
      items: places.map((p) => ({
        providerPlaceId: p.providerPlaceId,
        name: p.name,
        formattedAddress: p.formattedAddress ?? '',
        latitude: p.latitude,
        longitude: p.longitude,
        rating: p.rating,
        types: p.types ?? [],
      })),
    };
  }

  async autocompleteHotels(
    rawQuery: string,
    bias?: { lat?: number; lng?: number; radiusMeters?: number },
  ) {
    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return { items: [] };

    const locationBias =
      bias?.lat != null && bias?.lng != null
        ? {
            latitude: bias.lat,
            longitude: bias.lng,
            radiusMeters: bias.radiusMeters,
          }
        : undefined;

    const predictions = await this.placesProvider.autocompleteHotels(
      q,
      locationBias,
    );

    return {
      items: predictions.map((p) => ({
        providerPlaceId: p.providerPlaceId,
        name: p.name,
        subtitle: p.subtitle,
      })),
    };
  }

  async autocomplete(rawQuery: string, iconBaseUrl: string) {
    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return { items: [] };

    const predictions = await this.placesProvider.autocompletePlaces(q);
    if (predictions.length === 0) return { items: [] };

    // Destinos curados da Home casam pelo mesmo providerPlaceId.
    const curated = await this.prisma.baseTrip.findMany({
      where: {
        providerPlaceId: { in: predictions.map((p) => p.providerPlaceId) },
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        homeSortOrder: { not: null },
      },
      select: { providerPlaceId: true, cardImage: true, coverImage: true },
    });
    const curatedImage = new Map<string, string>();
    for (const c of curated) {
      const img = c.cardImage ?? c.coverImage;
      if (c.providerPlaceId && img) curatedImage.set(c.providerPlaceId, img);
    }

    const base = iconBaseUrl.replace(/\/$/, '');
    return {
      items: predictions.map((p) => ({
        providerPlaceId: p.providerPlaceId,
        name: p.name,
        subtitle: p.subtitle,
        iconUrl:
          curatedImage.get(p.providerPlaceId) ??
          `${base}/${placeIconKind(p.types)}.svg`,
      })),
    };
  }

  async getPlaceDetails(providerPlaceId: string) {
    const details = await this.placesProvider.getPlaceDetails(providerPlaceId);
    if (!details)
      throw new NotFoundException('Local não encontrado no provedor.');
    return details;
  }

  async enrichItineraryItem(
    userId: string,
    itemId: string,
    providerPlaceId: string,
  ) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        tripDay: {
          include: {
            trip: {
              include: { createdFromGuestJourneys: true, purchases: true },
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('ItineraryItem não encontrado');
    if (item.tripDay.trip.userId !== userId)
      throw new ForbiddenException(
        'Não autorizado. Você não é o dono desta viagem.',
      );

    if (isTripLocked(item.tripDay.trip) && item.tripDay.dayNumber > 1) {
      throw new ForbiddenException(
        'O acesso e alteração de itens a partir do Dia 2 requer confirmação de pagamento.',
      );
    }

    const details = await this.getPlaceDetails(providerPlaceId);

    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        providerPlaceId,
        placeProvider: 'GOOGLE',
        location: item.location || details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        googleMapsLink: item.googleMapsLink || details.googleMapsUri,
        externalLink: item.externalLink || details.websiteUri,
        isUserModified: true,
      },
    });
  }

  async enrichBaseAttraction(id: string, providerPlaceId: string) {
    const attr = await this.prisma.baseAttraction.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException('BaseAttraction não encontrada');

    const details = await this.getPlaceDetails(providerPlaceId);

    return this.prisma.baseAttraction.update({
      where: { id },
      data: {
        providerPlaceId,
        placeProvider: 'GOOGLE',
        address: attr.address || details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        googleMapsLink: attr.googleMapsLink || details.googleMapsUri,
      },
    });
  }

  async enrichBaseRestaurant(id: string, providerPlaceId: string) {
    const rest = await this.prisma.baseRestaurant.findUnique({ where: { id } });
    if (!rest) throw new NotFoundException('BaseRestaurant não encontrado');

    const details = await this.getPlaceDetails(providerPlaceId);

    return this.prisma.baseRestaurant.update({
      where: { id },
      data: {
        providerPlaceId,
        placeProvider: 'GOOGLE',
        address: rest.address || details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        googleMapsLink: rest.googleMapsLink || details.googleMapsUri,
        rating: rest.rating || details.rating,
      },
    });
  }

  async enrichItineraryItemAdmin(itemId: string, providerPlaceId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { tripDay: { include: { trip: true } } },
    });

    if (!item) throw new NotFoundException('ItineraryItem não encontrado');

    const details = await this.getPlaceDetails(providerPlaceId);

    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        providerPlaceId,
        placeProvider: 'GOOGLE',
        location: item.location || details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        googleMapsLink: item.googleMapsLink || details.googleMapsUri,
        externalLink: item.externalLink || details.websiteUri,
        isUserModified: true,
      },
    });
  }
}
