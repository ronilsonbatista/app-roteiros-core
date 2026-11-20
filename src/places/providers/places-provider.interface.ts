export interface PlaceSearchResult {
  provider: string;
  providerPlaceId: string;
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  userRatingsTotal?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  types?: string[];
  priceLevel?: number | string;
  priceLevelDisplay?: string;
}

export interface PlacePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
  /** Resolved Google-hosted URI safe for clients (no API key). */
  photoUri?: string;
  authorAttributions?: Array<{
    displayName?: string;
    uri?: string;
    photoUri?: string;
  }>;
}

export interface PlaceReview {
  rating?: number;
  text?: string;
  relativePublishTimeDescription?: string;
  authorName?: string;
  authorPhotoUri?: string;
  authorUri?: string;
  publishTime?: string;
}

export interface PlaceDetails {
  providerPlaceId?: string;
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  userRatingsTotal?: number;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  priceLevel?: number | string;
  /** UI-ready $, $$, $$$, $$$$ */
  priceLevelDisplay?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: string;
  /** Compact hours for Detalhes (e.g. "12:00-23:00") or weekday summary. */
  openingHoursText?: string;
  weekdayDescriptions?: string[];
  editorialSummary?: string;
  photos?: PlacePhoto[];
  reviews?: PlaceReview[];
}

export interface PlacesLocationBias {
  latitude: number;
  longitude: number;
  /** meters; Google Places Autocomplete max circle radius is 50000 */
  radiusMeters?: number;
}

export interface PlaceAutocompleteResult {
  providerPlaceId: string;
  name: string;
  subtitle: string;
  types: string[];
}

export interface PlacesProvider {
  searchPlaces(
    query: string,
    opts?: { includedType?: string; locationBias?: PlacesLocationBias },
  ): Promise<PlaceSearchResult[]>;
  autocompleteHotels?(
    input: string,
    locationBias?: PlacesLocationBias,
  ): Promise<PlaceAutocompleteResult[]>;
  getPlaceDetails(providerPlaceId: string): Promise<PlaceDetails | null>;
}

/** Map Google Places (New) priceLevel enum / legacy int → 0–4 scale. */
export function priceLevelToNumeric(
  priceLevel?: number | string | null,
): number | undefined {
  if (priceLevel == null) return undefined;
  if (typeof priceLevel === 'number') {
    if (!Number.isFinite(priceLevel) || priceLevel < 0) return undefined;
    return Math.min(4, Math.max(0, Math.trunc(priceLevel)));
  }
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[priceLevel];
}

/** Map Google Places (New) priceLevel enum / legacy int → $, $$, … */
export function priceLevelToDisplay(
  priceLevel?: number | string | null,
): string | undefined {
  if (priceLevel == null) return undefined;
  if (typeof priceLevel === 'number') {
    if (priceLevel <= 0) return undefined;
    return '$'.repeat(Math.min(4, Math.max(1, priceLevel)));
  }
  const map: Record<string, string> = {
    PRICE_LEVEL_FREE: '',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  const display = map[priceLevel];
  if (display === '') return undefined;
  return display;
}
