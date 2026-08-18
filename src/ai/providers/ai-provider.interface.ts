import { CuratedContextResult } from '../curation/curation-retrieval.service';

export interface GenerateItineraryInput {
  destination: string;
  numberOfDays: number;
  travelProfile: any;
  baseTrip?: any;
}

export interface GuestDestinationInput {
  name: string;
  arrivalDate?: string;
  arrivalTime?: string;
  departureDate?: string;
  departureTime?: string;
  order: number;
}

export interface GuestTravelersInput {
  adults: number;
  children: number;
  elders: number;
}

export interface GuestActivityHoursInput {
  startTime?: string;
  endTime?: string;
}

export interface GenerateGuestItineraryInput {
  journeyId: string;
  destinations: GuestDestinationInput[];
  travelers: GuestTravelersInput;
  interests: string[];
  activityHours?: GuestActivityHoursInput;
  budgetLevel?: string;
  travelStyle?: string;
  curatedContext?: CuratedContextResult;
}

export interface AIProviderResult {
  rawResponse: any;
  parsedData: any;
  tokensUsed: number;
  model: string;
  provider: string;
}

export interface AIProvider {
  generateItinerary(input: GenerateItineraryInput): Promise<AIProviderResult>;
  generateGuestItinerary(input: GenerateGuestItineraryInput): Promise<AIProviderResult>;
}
