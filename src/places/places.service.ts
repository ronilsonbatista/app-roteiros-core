import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { isTripLocked } from '../trips/trips.util';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placesProvider: GooglePlacesProvider,
  ) {}

  async searchPlaces(query: string) {
    return this.placesProvider.searchPlaces(query);
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
