import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import {
  PlacesProvider,
  PlaceSearchResult,
  PlaceDetails,
  PlaceAutocompleteResult,
  PlacesLocationBias,
  PlacePhoto,
  PlaceReview,
  priceLevelToDisplay,
} from './places-provider.interface';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'priceLevel',
  'types',
  'primaryType',
  'primaryTypeDisplayName',
  'regularOpeningHours',
  'currentOpeningHours',
  'editorialSummary',
  'photos',
  'reviews',
].join(',');

@Injectable()
export class GooglePlacesProvider implements PlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://places.googleapis.com/v1/places';
  private readonly maxDetailPhotos = 5;
  private readonly maxDetailReviews = 5;

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  async searchPlaces(
    query: string,
    opts?: { includedType?: string; locationBias?: PlacesLocationBias },
  ): Promise<PlaceSearchResult[]> {
    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API Key is not configured. Returning empty list.',
      );
      return [];
    }

    try {
      const body: Record<string, unknown> = { textQuery: query };
      if (opts?.includedType) {
        body.includedType = opts.includedType;
      }
      if (opts?.locationBias) {
        body.locationBias = {
          circle: {
            center: {
              latitude: opts.locationBias.latitude,
              longitude: opts.locationBias.longitude,
            },
            radius: Math.min(opts.locationBias.radiusMeters ?? 50000, 50000),
          },
        };
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}:searchText`, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.types,places.priceLevel',
          },
        }),
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
        priceLevelDisplay: priceLevelToDisplay(place.priceLevel),
      }));
    } catch (error) {
      this.logger.error('Failed to search Google Places', error);
      throw new HttpException(
        'Falha ao buscar lugares no provedor externo',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async autocompletePlaces(input: string): Promise<PlaceAutocompleteResult[]> {
    return this.autocompleteWithTypes(input, [
      'locality',
      'administrative_area_level_1',
      'administrative_area_level_2',
      'country',
    ]);
  }

  /**
   * Autocomplete restrito a hospedagens (lodging). Preferível ao Text Search
   * no typeahead: SKU Autocomplete, sem Place Details / Photos até o usuário
   * selecionar um item.
   */
  async autocompleteHotels(
    input: string,
    locationBias?: PlacesLocationBias,
  ): Promise<PlaceAutocompleteResult[]> {
    return this.autocompleteWithTypes(input, ['lodging'], locationBias);
  }

  private async autocompleteWithTypes(
    input: string,
    includedPrimaryTypes: string[],
    locationBias?: PlacesLocationBias,
  ): Promise<PlaceAutocompleteResult[]> {
    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API Key is not configured. Returning empty list.',
      );
      return [];
    }

    try {
      const body: Record<string, unknown> = {
        input,
        languageCode: 'pt-BR',
        includedPrimaryTypes,
      };
      if (locationBias) {
        body.locationBias = {
          circle: {
            center: {
              latitude: locationBias.latitude,
              longitude: locationBias.longitude,
            },
            radius: Math.min(locationBias.radiusMeters ?? 50000, 50000),
          },
        };
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}:autocomplete`, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask':
              'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
          },
        }),
      );

      const suggestions: any[] = response.data.suggestions || [];

      return suggestions
        .map((s) => s.placePrediction)
        .filter((p) => p?.placeId)
        .map((p) => ({
          providerPlaceId: p.placeId,
          name: p.structuredFormat?.mainText?.text || p.text?.text || '',
          subtitle:
            p.structuredFormat?.secondaryText?.text || p.text?.text || '',
          types: p.types || [],
        }));
    } catch {
      // Não logar o erro bruto: pode conter a URL/headers com a chave.
      this.logger.error('Failed to autocomplete Google Places');
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
            'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK,
          },
          params: { languageCode: 'pt-BR' },
        }),
      );

      const place = response.data;
      if (!place) return null;

      const photos = await this.resolvePhotos(
        (place.photos || []).slice(0, this.maxDetailPhotos),
      );

      return {
        providerPlaceId: place.id || providerPlaceId,
        name: place.displayName?.text || '',
        formattedAddress: place.formattedAddress,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        rating: place.rating,
        userRatingsTotal: place.userRatingCount,
        internationalPhoneNumber: place.internationalPhoneNumber,
        websiteUri: place.websiteUri,
        googleMapsUri: place.googleMapsUri,
        priceLevel: place.priceLevel,
        priceLevelDisplay: priceLevelToDisplay(place.priceLevel),
        types: place.types || [],
        primaryType: place.primaryType,
        primaryTypeDisplayName:
          place.primaryTypeDisplayName?.text || place.primaryTypeDisplayName,
        openingHoursText: this.formatOpeningHoursText(
          place.currentOpeningHours || place.regularOpeningHours,
        ),
        weekdayDescriptions:
          place.regularOpeningHours?.weekdayDescriptions ||
          place.currentOpeningHours?.weekdayDescriptions,
        editorialSummary:
          place.editorialSummary?.text || place.editorialSummary?.overview,
        photos,
        reviews: this.mapReviews(
          (place.reviews || []).slice(0, this.maxDetailReviews),
        ),
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

  private formatOpeningHoursText(hours?: {
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { hour?: number; minute?: number; day?: number };
      close?: { hour?: number; minute?: number; day?: number };
    }>;
  }): string | undefined {
    if (!hours) return undefined;

    const today = hours.periods?.[0];
    if (today?.open && today?.close) {
      const fmt = (h?: number, m?: number) =>
        `${String(h ?? 0).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
      return `${fmt(today.open.hour, today.open.minute)}-${fmt(today.close.hour, today.close.minute)}`;
    }

    const descriptions = hours.weekdayDescriptions;
    if (descriptions?.length) {
      // Prefer a compact single-line summary when all days share the same hours.
      const stripped = descriptions.map((d) =>
        d.replace(/^[^:]+:\s*/u, '').trim(),
      );
      if (stripped.every((s) => s === stripped[0])) {
        return stripped[0].replace(/\s+/g, '').replace('–', '-').replace('—', '-');
      }
      return descriptions.join(' · ');
    }

    return undefined;
  }

  private mapReviews(raw: any[]): PlaceReview[] {
    return raw.map((r) => ({
      rating: r.rating,
      text: r.text?.text || r.originalText?.text,
      relativePublishTimeDescription: r.relativePublishTimeDescription,
      authorName: r.authorAttribution?.displayName,
      authorPhotoUri: r.authorAttribution?.photoUri,
      authorUri: r.authorAttribution?.uri,
      publishTime: r.publishTime,
    }));
  }

  private async resolvePhotos(rawPhotos: any[]): Promise<PlacePhoto[]> {
    const mapped: PlacePhoto[] = [];
    for (const photo of rawPhotos) {
      if (!photo?.name) continue;
      const base: PlacePhoto = {
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        authorAttributions: (photo.authorAttributions || []).map((a: any) => ({
          displayName: a.displayName,
          uri: a.uri,
          photoUri: a.photoUri,
        })),
      };
      try {
        const media = await firstValueFrom(
          this.httpService.get(
            `https://places.googleapis.com/v1/${photo.name}/media`,
            {
              headers: { 'X-Goog-Api-Key': this.apiKey },
              params: {
                maxHeightPx: 1200,
                skipHttpRedirect: true,
              },
            },
          ),
        );
        if (media.data?.photoUri) {
          base.photoUri = media.data.photoUri;
        }
      } catch {
        // Keep name so a future proxy can resolve; do not fail the whole details call.
        this.logger.warn(`Failed to resolve place photo media for ${photo.name}`);
      }
      mapped.push(base);
    }
    return mapped;
  }
}
