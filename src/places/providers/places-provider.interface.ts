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
  name: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  priceLevel?: number;
  types?: string[];
}

export interface PlacesProvider {
  searchPlaces(query: string): Promise<PlaceSearchResult[]>;
  getPlaceDetails(providerPlaceId: string): Promise<PlaceDetails | null>;
}
