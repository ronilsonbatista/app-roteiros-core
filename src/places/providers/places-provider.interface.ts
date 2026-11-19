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
  priceLevel?: number;
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
  priceLevel?: number;
  types?: string[];
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
