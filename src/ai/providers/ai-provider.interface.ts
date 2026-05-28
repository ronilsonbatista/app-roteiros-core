export interface GenerateItineraryInput {
  destination: string;
  numberOfDays: number;
  travelProfile: any;
  baseTrip?: any;
}

export interface AIProvider {
  generateItinerary(input: GenerateItineraryInput): Promise<{
    rawResponse: any;
    parsedData: any;
    tokensUsed: number;
    model: string;
    provider: string;
  }>;
}
