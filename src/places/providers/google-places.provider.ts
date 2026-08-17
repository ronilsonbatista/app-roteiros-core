import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import {
  PlacesProvider,
  PlaceSearchResult,
  PlaceDetails,
} from './places-provider.interface';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GooglePlacesProvider implements PlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://places.googleapis.com/v1/places';

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  async searchPlaces(query: string): Promise<PlaceSearchResult[]> {
    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API Key is not configured. Returning empty list.',
      );
      return [];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}:searchText`,
          { textQuery: query },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': this.apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.types,places.priceLevel',
            },
          },
        ),
      );

      const places = response.data.places || [];

      return places.map((place: any) => ({
        provider: 'GOOGLE',
        providerPlaceId: place.id,
        name: place.displayName?.text || '',
        formattedAddress: place.formattedAddress,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        rating: place.rating,
        userRatingsTotal: place.userRatingCount,
        googleMapsUri: place.googleMapsUri,
        websiteUri: place.websiteUri,
        types: place.types || [],
        priceLevel: place.priceLevel,
      }));
    } catch (error) {
      this.logger.error('Failed to search Google Places', error);
      throw new HttpException(
        'Falha ao buscar lugares no provedor externo',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getPlaceDetails(providerPlaceId: string): Promise<PlaceDetails | null> {
    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API Key is not configured. Returning null.',
      );
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/${providerPlaceId}`, {
          headers: {
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask':
              'displayName,formattedAddress,location,rating,internationalPhoneNumber,websiteUri,googleMapsUri,priceLevel,types',
          },
        }),
      );

      const place = response.data;
      if (!place) return null;

      return {
        name: place.displayName?.text || '',
        formattedAddress: place.formattedAddress,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        rating: place.rating,
        internationalPhoneNumber: place.internationalPhoneNumber,
        websiteUri: place.websiteUri,
        googleMapsUri: place.googleMapsUri,
        priceLevel: place.priceLevel,
        types: place.types || [],
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get Google Place details for ID ${providerPlaceId}`,
        error,
      );
      if (error.response?.status === 404) return null;
      throw new HttpException(
        'Falha ao buscar detalhes no provedor externo',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
