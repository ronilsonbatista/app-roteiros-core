import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseTripStatus } from '@prisma/client';

export interface DestinationQueryInput {
  name: string;
  providerPlaceId?: string;
  city?: string;
  country?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  departureDate?: string;
  departureTime?: string;
}

export interface CuratedRetrievalInput {
  destinations: DestinationQueryInput[];
  numberOfDays?: number;
  interests?: string[];
  budgetLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'PREMIUM';
  travelers?: {
    adults: number;
    children: number;
    elders: number;
  };
  travelStyle?: string;
}

export type CurationCoverage = 'STRONG' | 'PARTIAL' | 'NONE';

export interface ScoredBaseTrip {
  baseTrip: any;
  score: number;
  matchedTags: string[];
  matchReasons: string[];
}

export interface ScoredBaseAttraction {
  attraction: any;
  score: number;
  matchedTags: string[];
}

export interface ScoredBaseRestaurant {
  restaurant: any;
  score: number;
}

export interface SingleDestinationCuratedContext {
  destinationName: string;
  providerPlaceId?: string;
  coverage: CurationCoverage;
  bestBaseTrip?: ScoredBaseTrip;
  otherBaseTrips: ScoredBaseTrip[];
  attractions: ScoredBaseAttraction[];
  restaurants: ScoredBaseRestaurant[];
}

export interface CuratedContextResult {
  overallCoverage: CurationCoverage;
  destinations: SingleDestinationCuratedContext[];
}

export const DEFAULT_RETRIEVAL_WEIGHTS = {
  providerPlaceIdMatch: 60,
  exactDestinationMatch: 50,
  partialCityMatch: 30,
  tagOverlapMatch: 10,
  budgetMatch: 15,
  durationMatch: 10,
  kidElderMatch: 10,
};

export const DEFAULT_RETRIEVAL_LIMITS = {
  maxBaseTripsPerDestination: 3,
  maxAttractionsPerDestination: 10,
  maxRestaurantsPerDestination: 5,
};

@Injectable()
export class CurationRetrievalService {
  private readonly logger = new Logger(CurationRetrievalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async retrieveCuratedContext(
    input: CuratedRetrievalInput,
  ): Promise<CuratedContextResult> {
    if (!input.destinations || input.destinations.length === 0) {
      return {
        overallCoverage: 'NONE',
        destinations: [],
      };
    }

    const destinationResults: SingleDestinationCuratedContext[] = [];

    for (const dest of input.destinations) {
      const destContext = await this.retrieveForSingleDestination(dest, input);
      destinationResults.push(destContext);
    }

    // Determine overall coverage across destinations
    const coverages = destinationResults.map((d) => d.coverage);
    let overallCoverage: CurationCoverage = 'NONE';

    if (coverages.every((c) => c === 'STRONG')) {
      overallCoverage = 'STRONG';
    } else if (coverages.some((c) => c === 'STRONG' || c === 'PARTIAL')) {
      overallCoverage = 'PARTIAL';
    } else {
      overallCoverage = 'NONE';
    }

    return {
      overallCoverage,
      destinations: destinationResults,
    };
  }

  private async retrieveForSingleDestination(
    dest: DestinationQueryInput,
    input: CuratedRetrievalInput,
  ): Promise<SingleDestinationCuratedContext> {
    const destNameClean = (dest.name || '').trim().toLowerCase();
    const cityClean = (dest.city || '').trim().toLowerCase();

    // Query BaseTrips matching destination, city, or country
    const baseTrips = await this.prisma.baseTrip.findMany({
      where: {
        status: BaseTripStatus.PUBLISHED,
        OR: [
          { destination: { contains: dest.name || '', mode: 'insensitive' } },
          dest.city
            ? { city: { contains: dest.city, mode: 'insensitive' } }
            : undefined,
          dest.country
            ? { country: { contains: dest.country, mode: 'insensitive' } }
            : undefined,
        ].filter(Boolean) as any[],
      },
      include: {
        days: {
          include: {
            attractions: true,
            restaurants: true,
          },
          orderBy: { dayNumber: 'asc' },
        },
      },
    });

    const scoredBaseTrips: ScoredBaseTrip[] = [];

    for (const trip of baseTrips) {
      const scoreResult = this.scoreBaseTrip(trip, dest, input);
      if (scoreResult.score > 0) {
        scoredBaseTrips.push(scoreResult);
      }
    }

    // Sort BaseTrips descending by score
    scoredBaseTrips.sort((a, b) => b.score - a.score);

    const limitedBaseTrips = scoredBaseTrips.slice(
      0,
      DEFAULT_RETRIEVAL_LIMITS.maxBaseTripsPerDestination,
    );

    const bestBaseTrip = limitedBaseTrips.length > 0 ? limitedBaseTrips[0] : undefined;
    const otherBaseTrips = limitedBaseTrips.length > 1 ? limitedBaseTrips.slice(1) : [];

    if (bestBaseTrip && bestBaseTrip.score >= 40) {
      // STRONG coverage: We have a high-matching published BaseTrip
      const attractions: ScoredBaseAttraction[] = [];
      const restaurants: ScoredBaseRestaurant[] = [];

      for (const day of bestBaseTrip.baseTrip.days || []) {
        for (const attr of day.attractions || []) {
          attractions.push({
            attraction: attr,
            score: 50,
            matchedTags: [],
          });
        }
        for (const rest of day.restaurants || []) {
          restaurants.push({
            restaurant: rest,
            score: 50,
          });
        }
      }

      return {
        destinationName: dest.name,
        providerPlaceId: dest.providerPlaceId,
        coverage: 'STRONG',
        bestBaseTrip,
        otherBaseTrips,
        attractions: attractions.slice(
          0,
          DEFAULT_RETRIEVAL_LIMITS.maxAttractionsPerDestination,
        ),
        restaurants: restaurants.slice(
          0,
          DEFAULT_RETRIEVAL_LIMITS.maxRestaurantsPerDestination,
        ),
      };
    }

    // Fallback: Query standalone BaseAttractions & BaseRestaurants for destination
    const attractions = await this.retrieveAttractionsForDestination(dest, input);
    const restaurants = await this.retrieveRestaurantsForDestination(dest, input);

    const hasContent = attractions.length > 0 || restaurants.length > 0;
    const coverage: CurationCoverage = hasContent ? 'PARTIAL' : 'NONE';

    return {
      destinationName: dest.name,
      providerPlaceId: dest.providerPlaceId,
      coverage,
      bestBaseTrip: undefined,
      otherBaseTrips: [],
      attractions,
      restaurants,
    };
  }

  private scoreBaseTrip(
    trip: any,
    dest: DestinationQueryInput,
    input: CuratedRetrievalInput,
  ): ScoredBaseTrip {
    let score = 0;
    const matchedTags: string[] = [];
    const matchReasons: string[] = [];

    const tripDest = (trip.destination || '').toLowerCase();
    const searchDest = (dest.name || '').toLowerCase();
    const searchCity = (dest.city || '').toLowerCase();

    // 1. Destination match
    if (searchDest && tripDest === searchDest) {
      score += DEFAULT_RETRIEVAL_WEIGHTS.exactDestinationMatch;
      matchReasons.push('Destino exato correspondente');
    } else if (searchDest && tripDest.includes(searchDest)) {
      score += DEFAULT_RETRIEVAL_WEIGHTS.partialCityMatch;
      matchReasons.push('Destino parcialmente correspondente');
    } else if (searchCity && (trip.city || '').toLowerCase().includes(searchCity)) {
      score += DEFAULT_RETRIEVAL_WEIGHTS.partialCityMatch;
      matchReasons.push('Cidade correspondente');
    }

    // 2. Tag / Interest overlap
    if (input.interests && input.interests.length > 0 && trip.tags) {
      const tripTags = (trip.tags as string[]).map((t) => t.toLowerCase());
      for (const interest of input.interests) {
        const interestClean = interest.toLowerCase();
        if (tripTags.some((t) => t.includes(interestClean) || interestClean.includes(t))) {
          score += DEFAULT_RETRIEVAL_WEIGHTS.tagOverlapMatch;
          matchedTags.push(interest);
          matchReasons.push(`Interesse compatível: ${interest}`);
        }
      }
    }

    // 3. Duration match
    if (input.numberOfDays && trip.numberOfDays) {
      const diff = Math.abs(trip.numberOfDays - input.numberOfDays);
      if (diff === 0) {
        score += DEFAULT_RETRIEVAL_WEIGHTS.durationMatch;
        matchReasons.push('Duração exata da viagem');
      } else if (diff <= 2) {
        score += DEFAULT_RETRIEVAL_WEIGHTS.durationMatch / 2;
        matchReasons.push('Duração aproximada da viagem');
      }
    }

    // 4. Traveler suitability (kids / elders)
    if (input.travelers) {
      const hasKids = input.travelers.children > 0;
      const hasElders = input.travelers.elders > 0;

      if (hasKids || hasElders) {
        let suitableCount = 0;
        for (const day of trip.days || []) {
          for (const attr of day.attractions || []) {
            if ((hasKids && attr.goodForKids) || (hasElders && attr.goodForElders)) {
              suitableCount++;
            }
          }
        }
        if (suitableCount > 0) {
          score += DEFAULT_RETRIEVAL_WEIGHTS.kidElderMatch;
          matchReasons.push('Atrações adequadas para o perfil de viajantes');
        }
      }
    }

    return {
      baseTrip: trip,
      score,
      matchedTags,
      matchReasons,
    };
  }

  private async retrieveAttractionsForDestination(
    dest: DestinationQueryInput,
    input: CuratedRetrievalInput,
  ): Promise<ScoredBaseAttraction[]> {
    const attractions = await this.prisma.baseAttraction.findMany({
      where: {
        baseTripDay: {
          baseTrip: {
            destination: { contains: dest.name || '', mode: 'insensitive' },
            status: BaseTripStatus.PUBLISHED,
          },
        },
      },
      take: DEFAULT_RETRIEVAL_LIMITS.maxAttractionsPerDestination * 2,
    });

    const scored: ScoredBaseAttraction[] = [];

    for (const attr of attractions) {
      let score = 20; // base score for matching destination
      const matchedTags: string[] = [];

      if (input.interests && input.interests.length > 0) {
        const catStr = (attr.category || '').toLowerCase();
        for (const interest of input.interests) {
          if (catStr.includes(interest.toLowerCase())) {
            score += 10;
            matchedTags.push(interest);
          }
        }
      }

      if (input.travelers?.children && attr.goodForKids) {
        score += 10;
      }
      if (input.travelers?.elders && attr.goodForElders) {
        score += 10;
      }

      scored.push({
        attraction: attr,
        score,
        matchedTags,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, DEFAULT_RETRIEVAL_LIMITS.maxAttractionsPerDestination);
  }

  private async retrieveRestaurantsForDestination(
    dest: DestinationQueryInput,
    input: CuratedRetrievalInput,
  ): Promise<ScoredBaseRestaurant[]> {
    const restaurants = await this.prisma.baseRestaurant.findMany({
      where: {
        baseTripDay: {
          baseTrip: {
            destination: { contains: dest.name || '', mode: 'insensitive' },
            status: BaseTripStatus.PUBLISHED,
          },
        },
      },
      take: DEFAULT_RETRIEVAL_LIMITS.maxRestaurantsPerDestination * 2,
    });

    const scored: ScoredBaseRestaurant[] = [];

    for (const rest of restaurants) {
      let score = 20;

      if (rest.rating && rest.rating >= 4.5) {
        score += 10;
      }

      scored.push({
        restaurant: rest,
        score,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, DEFAULT_RETRIEVAL_LIMITS.maxRestaurantsPerDestination);
  }
}
