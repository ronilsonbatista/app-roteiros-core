import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider, inferCurrency } from './providers/openai.provider';
import { CurationRetrievalService } from './curation/curation-retrieval.service';
import { PlacesService } from '../places/places.service';
import { ItineraryService } from '../itinerary/itinerary.service';
import { TripsService } from '../trips/trips.service';
import {
  BaseTripStatus,
  GuestJourneyStatus,
  ItineraryCategory,
  TicketStatus,
  TransitMode,
} from '@prisma/client';

describe('Phase 4 Universal Generation (Universalidade & Multi-Destinos)', () => {
  let aiService: AiService;
  let itineraryService: ItineraryService;
  let tripsService: TripsService;
  let curationService: CurationRetrievalService;
  let prismaMock: any;
  let openAIProviderMock: any;
  let placesServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      trip: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userTravelProfile: {
        findUnique: jest.fn(),
      },
      baseTrip: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      baseAttraction: {
        findMany: jest.fn(),
      },
      baseRestaurant: {
        findMany: jest.fn(),
      },
      tripAccommodation: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      tripDay: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      itineraryItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      guestJourney: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      aIRequest: {
        create: jest.fn().mockResolvedValue({ id: 'ai-req-audit-1' }),
      },
    };

    prismaMock.$transaction = jest.fn((arg) => {
      if (typeof arg === 'function') {
        return arg(prismaMock);
      }
      return Promise.all(arg);
    });

    openAIProviderMock = {
      generateItinerary: jest.fn(),
      generateGuestItinerary: jest.fn(),
    };

    placesServiceMock = {
      getPlaceDetails: jest.fn().mockImplementation((placeId: string) => {
        if (!placeId || placeId.startsWith('fake') || placeId.startsWith('synth')) {
          return Promise.reject(new NotFoundException('Place not found in Google'));
        }
        return Promise.resolve({
          provider: 'GOOGLE',
          providerPlaceId: placeId,
          name: 'Verified Real Place',
          formattedAddress: 'Genuine Street, 100',
          latitude: 41.8902,
          longitude: 12.4922,
          rating: 4.7,
          googleMapsUri: `https://maps.google.com/?q=${placeId}`,
        });
      }),
      searchPlaces: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        CurationRetrievalService,
        ItineraryService,
        TripsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OpenAIProvider, useValue: openAIProviderMock },
        { provide: PlacesService, useValue: placesServiceMock },
      ],
    }).compile();

    aiService = module.get<AiService>(AiService);
    itineraryService = module.get<ItineraryService>(ItineraryService);
    tripsService = module.get<TripsService>(TripsService);
    curationService = module.get<CurationRetrievalService>(CurationRetrievalService);
  });

  // =========================================================================
  // 1. TESTS_WITH_BASE: Metrópole com base própria PUBLISHED + perfil gastronômico/cultural
  // =========================================================================
  describe('1. TESTS_WITH_BASE (Roma with PUBLISHED BaseTrip)', () => {
    it('should retrieve published base trip, enrich items, and log baseTripId in audit', async () => {
      const mockPublishedRomaTrip = {
        id: 'base-trip-roma-curated-1',
        title: 'Roma Histórica e Gastronomia Autêntica',
        destination: 'Roma',
        city: 'Roma',
        status: BaseTripStatus.PUBLISHED,
        numberOfDays: 3,
        tags: ['gastronomia', 'cultura', 'historia'],
        days: [
          {
            dayNumber: 1,
            attractions: [
              {
                id: 'attr-coliseu',
                name: 'Coliseu',
                category: 'TOURIST_ATTRACTION',
                providerPlaceId: 'ChIJ41pY',
                latitude: 41.8902,
                longitude: 12.4922,
                requiresTicket: true,
                address: 'Piazza del Colosseo, 1',
              },
            ],
            restaurants: [
              {
                id: 'rest-enzo',
                name: 'Da Enzo al 29',
                providerPlaceId: 'ChIJEnzo',
                latitude: 41.8885,
                longitude: 12.4775,
                address: 'Via dei Vascellari, 29',
              },
            ],
          },
        ],
      };

      prismaMock.baseTrip.findMany.mockResolvedValue([mockPublishedRomaTrip]);
      prismaMock.baseAttraction.findMany.mockResolvedValue([]);
      prismaMock.baseRestaurant.findMany.mockResolvedValue([]);

      const mockJourney = {
        id: 'journey-roma-cultural',
        destinations: [{ name: 'Roma', arrivalDate: '2026-10-01', departureDate: '2026-10-03' }],
        travelers: { adults: 2, children: 0, elders: 0 },
        interests: ['gastronomia', 'cultura'],
        budgetLevel: 'MEDIUM',
      };

      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            {
              dayNumber: 1,
              title: 'Dia 1: O Coração da Roma Antiga',
              items: [
                {
                  title: 'Coliseu',
                  category: 'TOURIST_ATTRACTION',
                  timeLabel: '09:00 - 11:00',
                  duration: 120,
                  cost: 25,
                  currency: 'EUR',
                  providerPlaceId: 'ChIJ41pY',
                },
                {
                  title: 'Da Enzo al 29',
                  category: 'RESTAURANT',
                  timeLabel: '12:30 - 14:00',
                  duration: 90,
                  cost: 35,
                  currency: 'EUR',
                  providerPlaceId: 'ChIJEnzo',
                },
              ],
            },
            {
              dayNumber: 2,
              title: 'Dia 2: Vaticano e Trastevere',
              items: [{ title: 'Museus Vaticanos', category: 'MUSEUM' }],
            },
            {
              dayNumber: 3,
              title: 'Dia 3: Panteão e Despedida',
              items: [{ title: 'Pantheon', category: 'TOURIST_ATTRACTION' }],
            },
          ],
        },
        tokensUsed: 400,
      });

      await aiService.generateGuestItinerary(mockJourney);

      // Verify guest journey updated to PREVIEW_READY
      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'journey-roma-cultural', status: GuestJourneyStatus.GENERATING },
          data: expect.objectContaining({
            status: GuestJourneyStatus.PREVIEW_READY,
            generatedItinerary: expect.objectContaining({
              overallCoverage: 'STRONG',
            }),
          }),
        }),
      );

      // Verify audit AIRequest created with baseTripId
      expect(prismaMock.aIRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestJourneyId: 'journey-roma-cultural',
            baseTripId: 'base-trip-roma-curated-1',
            status: 'SUCCESS',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 2. TESTS_PERSONA_DIFF: Metrópole com perfil geek/tecnologia vs tradicional
  // =========================================================================
  describe('2. TESTS_PERSONA_DIFF (Tóquio: Geek vs Gastronomia/Tradição)', () => {
    it('should score and prioritize different base trips for Geek vs Traditional personas in Tokyo', async () => {
      const mockTripGeek = {
        id: 'tokyo-geek-trip',
        title: 'Tóquio Futurista: Anime, Games e Akihabara',
        destination: 'Tóquio',
        city: 'Tóquio',
        status: BaseTripStatus.PUBLISHED,
        numberOfDays: 4,
        tags: ['tecnologia', 'anime', 'games', 'geek', 'otaku'],
        profile: 'Viajante jovem focado em cultura pop e tecnologia',
        days: [],
      };

      const mockTripTraditional = {
        id: 'tokyo-trad-trip',
        title: 'Tóquio Tradicional: Templos e Alta Gastronomia',
        destination: 'Tóquio',
        city: 'Tóquio',
        status: BaseTripStatus.PUBLISHED,
        numberOfDays: 4,
        tags: ['templos', 'gastronomia', 'tradicional', 'cultura', 'cha'],
        profile: 'Viajante focado em patrimônio e gastronomia',
        days: [],
      };

      prismaMock.baseTrip.findMany.mockResolvedValue([mockTripGeek, mockTripTraditional]);
      prismaMock.baseAttraction.findMany.mockResolvedValue([]);
      prismaMock.baseRestaurant.findMany.mockResolvedValue([]);

      // Persona 1: Geek
      const resultGeek = await curationService.retrieveCuratedContext({
        destinations: [{ name: 'Tóquio' }],
        numberOfDays: 4,
        interests: ['tecnologia', 'anime', 'games'],
        travelStyle: 'GEEK',
      });

      // Persona 2: Tradicional
      const resultTrad = await curationService.retrieveCuratedContext({
        destinations: [{ name: 'Tóquio' }],
        numberOfDays: 4,
        interests: ['gastronomia', 'templos', 'tradicional'],
        travelStyle: 'CULTURAL',
      });

      // Assertions: Different personas receive different base trips
      expect(resultGeek.destinations[0].bestBaseTrip?.baseTrip.id).toEqual('tokyo-geek-trip');
      expect(resultTrad.destinations[0].bestBaseTrip?.baseTrip.id).toEqual('tokyo-trad-trip');
      expect(resultGeek.destinations[0].bestBaseTrip?.score).toBeGreaterThan(
        resultTrad.destinations[0].otherBaseTrips[0]?.score || 0,
      );
    });
  });

  // =========================================================================
  // 3. TESTS_WITHOUT_BASE: Destino sem base própria (praia/natureza) — cobertura NONE, sem inventar Place ID
  // =========================================================================
  describe('3. TESTS_WITHOUT_BASE (Fernando de Noronha / Florianópolis)', () => {
    it('should return NONE coverage and never persist synthetic/hallucinated Place IDs', async () => {
      // Database has 0 base trips and 0 attractions for Fernando de Noronha
      prismaMock.baseTrip.findMany.mockResolvedValue([]);
      prismaMock.baseAttraction.findMany.mockResolvedValue([]);
      prismaMock.baseRestaurant.findMany.mockResolvedValue([]);

      const mockJourney = {
        id: 'journey-noronha-nature',
        destinations: [{ name: 'Fernando de Noronha', arrivalDate: '2026-11-10', departureDate: '2026-11-12' }],
        travelers: { adults: 2, children: 0, elders: 0 },
        interests: ['praia', 'natureza', 'mergulho'],
      };

      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            {
              dayNumber: 1,
              title: 'Dia 1: Chegada à Ilha e Baía do Sancho',
              items: [
                {
                  title: 'Praia do Sancho',
                  category: 'BEACH',
                  providerPlaceId: 'fake-synth-place-12345', // AI hallucinated a place ID!
                  cost: 0,
                  currency: 'BRL',
                },
                {
                  title: 'Mergulho com Tartarugas',
                  category: 'EXPERIENCE',
                  providerPlaceId: null, // Natural item without Place ID
                  cost: 150,
                  currency: 'BRL',
                },
              ],
            },
            {
              dayNumber: 2,
              title: 'Dia 2: Baía dos Porcos e Mirante',
              items: [{ title: 'Baía dos Porcos', category: 'BEACH' }],
            },
            {
              dayNumber: 3,
              title: 'Dia 3: Pôr do Sol no Boldró',
              items: [{ title: 'Forte do Boldró', category: 'TOURIST_ATTRACTION' }],
            },
          ],
        },
        tokensUsed: 350,
      });

      await aiService.generateGuestItinerary(mockJourney);

      // Verify guest journey updated to PREVIEW_READY with NONE coverage
      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: GuestJourneyStatus.PREVIEW_READY,
            generatedItinerary: expect.objectContaining({
              overallCoverage: 'NONE',
            }),
          }),
        }),
      );

      // Check captured items to ensure fake Place ID was discarded!
      const updateCall = prismaMock.guestJourney.updateMany.mock.calls[0][0];
      const itemsDay1 = updateCall.data.generatedItinerary.days[0].items;

      const sanchoItem = itemsDay1.find((i: any) => i.title === 'Praia do Sancho');
      expect(sanchoItem.providerPlaceId).toBeNull(); // Fake ID was rejected by PlacesService!
      expect(sanchoItem.currency).toEqual('BRL');

      const diveItem = itemsDay1.find((i: any) => i.title === 'Mergulho com Tartarugas');
      expect(diveItem.providerPlaceId).toBeNull();
      expect(diveItem.currency).toEqual('BRL');
    });
  });

  // =========================================================================
  // 4. TESTS_MULTI_CITY: Multi-cidades com transferência
  // =========================================================================
  describe('4. TESTS_MULTI_CITY (Roma + Florença)', () => {
    it('should partition days by city and include transport connection', async () => {
      const mockJourney = {
        id: 'journey-multi-city-it',
        destinations: [
          { name: 'Roma', city: 'Roma', arrivalDate: '2026-09-01', departureDate: '2026-09-02' },
          { name: 'Florença', city: 'Florença', arrivalDate: '2026-09-03', departureDate: '2026-09-04' },
        ],
        travelers: { adults: 2, children: 0, elders: 0 },
        interests: ['arte', 'historia'],
      };

      prismaMock.baseTrip.findMany.mockResolvedValue([]);
      prismaMock.baseAttraction.findMany.mockResolvedValue([]);
      prismaMock.baseRestaurant.findMany.mockResolvedValue([]);

      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            {
              dayNumber: 1,
              destination: 'Roma',
              title: 'Dia 1: Chegada em Roma',
              items: [{ title: 'Fontana di Trevi', category: 'TOURIST_ATTRACTION' }],
            },
            {
              dayNumber: 2,
              destination: 'Roma',
              title: 'Dia 2: Vaticano',
              items: [{ title: 'Basílica de São Pedro', category: 'TOURIST_ATTRACTION' }],
            },
            {
              dayNumber: 3,
              destination: 'Florença',
              title: 'Dia 3: Transferência para Florença e Duomo',
              items: [
                {
                  title: 'Trem Frecciarossa Roma Termini → Santa Maria Novella',
                  category: 'TRANSPORT',
                  timeLabel: '09:00 - 10:35',
                  duration: 95,
                  cost: 45,
                  currency: 'EUR',
                  notes: 'Deslocamento de alta velocidade entre cidades.',
                },
                {
                  title: 'Duomo di Firenze',
                  category: 'TOURIST_ATTRACTION',
                  timeLabel: '12:00 - 13:30',
                  duration: 90,
                  cost: 20,
                  currency: 'EUR',
                },
              ],
            },
            {
              dayNumber: 4,
              destination: 'Florença',
              title: 'Dia 4: Galleria dell Accademia e Partida',
              items: [{ title: 'Galleria dell Accademia', category: 'MUSEUM' }],
            },
          ],
        },
        tokensUsed: 500,
      });

      await aiService.generateGuestItinerary(mockJourney);

      const updateCall = prismaMock.guestJourney.updateMany.mock.calls[0][0];
      const days = updateCall.data.generatedItinerary.days;

      expect(days).toHaveLength(4);
      expect(days[0].destination).toEqual('Roma');
      expect(days[1].destination).toEqual('Roma');
      expect(days[2].destination).toEqual('Florença');
      expect(days[3].destination).toEqual('Florença');

      // Verify transport item present on transfer day
      const transferItem = days[2].items.find((i: any) => i.category === ItineraryCategory.TRANSPORT);
      expect(transferItem).toBeDefined();
      expect(transferItem.title).toContain('Trem');
      expect(transferItem.duration).toBeGreaterThanOrEqual(60);
    });
  });

  // =========================================================================
  // 5. NO_DESTINATION_HARDCODE: Universalidade sem hardcode de cidade
  // =========================================================================
  describe('5. NO_DESTINATION_HARDCODE (Universal Currency & Generation)', () => {
    it('should infer official currencies dynamically across distinct continents', () => {
      expect(inferCurrency('Tóquio, Japão')).toEqual('JPY');
      expect(inferCurrency('Roma, Itália')).toEqual('EUR');
      expect(inferCurrency('Paris, França')).toEqual('EUR');
      expect(inferCurrency('Londres, Reino Unido')).toEqual('GBP');
      expect(inferCurrency('Nova York, EUA')).toEqual('USD');
      expect(inferCurrency('Florianópolis, Brasil')).toEqual('BRL');
      expect(inferCurrency('Fernando de Noronha')).toEqual('BRL');
      expect(inferCurrency('Buenos Aires, Argentina')).toEqual('ARS');
      expect(inferCurrency('Santiago, Chile')).toEqual('CLP');
      expect(inferCurrency('Cancún, México')).toEqual('MXN');
      expect(inferCurrency('Sydney, Austrália')).toEqual('AUD');
      expect(inferCurrency('Zurique, Suíça')).toEqual('CHF');
      expect(inferCurrency('Dubai, Emirados Árabes')).toEqual('AED');
      expect(inferCurrency('Reykjavik, Islândia')).toBeNull(); // Graceful fallback to ISO prompt
    });
  });

  // =========================================================================
  // 6. OLD_CLIENT_COMPAT: Compatibilidade com clientes antigos
  // =========================================================================
  describe('6. OLD_CLIENT_COMPAT (Legacy Client JSON Parsing)', () => {
    it('should parse cleanly with a legacy client schema that ignores new additive fields', () => {
      const generatedItemPayload = {
        id: 'item-phase3-123',
        tripDayId: 'day-1',
        title: 'Café no Pantheon',
        description: 'Parada para café',
        category: 'CAFE',
        location: 'Piazza della Rotonda',
        timeLabel: '09:00 - 09:45',
        duration: 45,
        cost: 5.5,
        currency: 'EUR',
        order: 1,
        // Additive Phase 1-3 fields:
        transitDistanceMeters: 450,
        transitDurationMinutes: 6,
        transitMode: 'WALKING',
        ticketStatus: 'FREE',
        providerPlaceId: 'ChIJ12345',
        placeProvider: 'GOOGLE',
      };

      // Legacy client deserializer simulator (only knows core properties)
      const parseLegacyClient = (json: any) => {
        return {
          id: String(json.id),
          title: String(json.title),
          description: json.description ?? null,
          category: json.category,
          location: json.location,
          timeLabel: json.timeLabel,
          duration: Number(json.duration),
          cost: Number(json.cost),
          currency: String(json.currency),
          order: Number(json.order),
        };
      };

      const parsed = parseLegacyClient(generatedItemPayload);
      expect(parsed.title).toEqual('Café no Pantheon');
      expect(parsed.duration).toEqual(45);
      expect(parsed.cost).toEqual(5.5);
      expect(parsed.currency).toEqual('EUR');
    });
  });

  // =========================================================================
  // 7. SWAP_QUOTA_ENFORCED: Controle de cota de substituições
  // =========================================================================
  describe('7. SWAP_QUOTA_ENFORCED (Substitute Quota Enforced)', () => {
    it('should permit substitution when swaps are available and reject when exhausted', async () => {
      const mockTrip = {
        id: 'trip-swap-test',
        userId: 'user-1',
        allowedSwapsCount: 4,
        usedSwapsCount: 3, // 1 remaining!
        destination: 'Roma',
        premiumUnlockedAt: new Date(),
        createdFromGuestJourneys: [],
        purchases: [{ status: 'PAID' }],
        days: [{ id: 'day-1', dayNumber: 1 }],
      };

      const mockItem = {
        id: 'item-swap-target',
        tripDayId: 'day-1',
        title: 'Visita ao Museu',
        order: 1,
        duration: 90,
        category: ItineraryCategory.MUSEUM,
        tripDay: {
          id: 'day-1',
          dayNumber: 1,
          trip: mockTrip,
        },
      };

      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.trip.findUnique.mockResolvedValue(mockTrip);
      prismaMock.trip.update.mockImplementation(({ data }: any) => {
        return Promise.resolve({ ...mockTrip, ...data });
      });
      prismaMock.itineraryItem.update.mockResolvedValue({
        ...mockItem,
        title: 'Nova Atração Substituta',
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([
        { ...mockItem, title: 'Nova Atração Substituta', timeLabel: '09:00' },
      ]);

      // 1st swap: usedSwapsCount = 3 -> permitted, remaining becomes 0
      const res1 = await itineraryService.substitute(
        { id: 'user-1', role: 'USER' },
        'item-swap-target',
        {
          title: 'Nova Atração Substituta',
          category: ItineraryCategory.MUSEUM,
          duration: 90,
        },
      );

      expect(res1.quota.remainingSwaps).toEqual(0);
      expect(prismaMock.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { usedSwapsCount: 4 },
        }),
      );

      // 2nd swap: now usedSwapsCount = 4 -> quota exhausted!
      const exhaustedTrip = { ...mockTrip, usedSwapsCount: 4 };
      const exhaustedItem = { ...mockItem, tripDay: { ...mockItem.tripDay, trip: exhaustedTrip } };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(exhaustedItem);

      await expect(
        itineraryService.substitute(
          { id: 'user-1', role: 'USER' },
          'item-swap-target',
          { title: 'Outra Atração' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 8. INCOMPLETE_GUEST_NOT_READY: Guest incompleto não vira PREVIEW_READY
  // =========================================================================
  describe('8. INCOMPLETE_GUEST_NOT_READY (AI Divergent / Empty Days)', () => {
    it('should transition to FAILED and never to PREVIEW_READY when AI returns fewer days', async () => {
      const mockJourney = {
        id: 'journey-divergent',
        destinations: [{ name: 'Roma', arrivalDate: '2026-10-01', departureDate: '2026-10-03' }], // 3 days requested
        travelers: { adults: 1, children: 0, elders: 0 },
      };

      prismaMock.baseTrip.findMany.mockResolvedValue([]);
      prismaMock.baseAttraction.findMany.mockResolvedValue([]);
      prismaMock.baseRestaurant.findMany.mockResolvedValue([]);

      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            // Only 2 days returned instead of 3!
            { dayNumber: 1, title: 'Dia 1', items: [{ title: 'Coliseu' }] },
            { dayNumber: 2, title: 'Dia 2', items: [{ title: 'Vaticano' }] },
          ],
        },
        tokensUsed: 180,
      });

      await aiService.generateGuestItinerary(mockJourney);

      // Verify PREVIEW_READY was NEVER set
      expect(prismaMock.guestJourney.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: GuestJourneyStatus.PREVIEW_READY,
          }),
        }),
      );

      // Verify marked as FAILED
      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: GuestJourneyStatus.FAILED,
            generationErrorCode: 'OPENAI_ERROR',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // 9. ACCOMMODATION_RECALC: Accommodation recalcula Dia 1
  // =========================================================================
  describe('9. ACCOMMODATION_RECALC (Day 1 Transit from Hotel)', () => {
    it('should recalculate transit for Day 1 item 1 when accommodation is upserted', async () => {
      const mockTrip = {
        id: 'trip-acc-test',
        userId: 'user-1',
        destination: 'Roma',
        days: [{ id: 'day-1', dayNumber: 1 }],
      };

      const mockDay1Items = [
        {
          id: 'item-day1-first',
          tripDayId: 'day-1',
          order: 1,
          title: 'Coliseu',
          latitude: 41.8902,
          longitude: 12.4922,
          transitDistanceMeters: null,
          transitDurationMinutes: null,
        },
      ];

      prismaMock.trip.findUnique.mockResolvedValue(mockTrip);
      prismaMock.tripAccommodation.upsert.mockResolvedValue({
        id: 'acc-1',
        tripId: 'trip-acc-test',
        name: 'Hotel Bernini',
        latitude: 41.9038, // Hotel near Piazza Barberini (~1.6km from Coliseu)
        longitude: 12.4883,
      });
      prismaMock.tripDay.findMany.mockResolvedValue([{ id: 'day-1', dayNumber: 1 }]);
      prismaMock.tripDay.findFirst.mockResolvedValue({ id: 'day-1', dayNumber: 1 });
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day-1',
        dayNumber: 1,
        trip: {
          id: 'trip-acc-test',
          accommodation: {
            latitude: 41.9038,
            longitude: 12.4883,
          },
        },
        items: mockDay1Items,
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue(mockDay1Items);
      prismaMock.tripAccommodation.findUnique.mockResolvedValue({
        latitude: 41.9038,
        longitude: 12.4883,
      });
      prismaMock.itineraryItem.update.mockResolvedValue({});

      await tripsService.upsertAccommodation(
        { id: 'user-1', userId: 'user-1', role: 'USER' },
        'trip-acc-test',
        {
          name: 'Hotel Bernini',
          latitude: 41.9038,
          longitude: 12.4883,
        },
      );

      // Assert that item 1 was updated with transit from accommodation!
      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-day1-first' },
          data: expect.objectContaining({
            transitDistanceMeters: expect.any(Number),
            transitDurationMinutes: expect.any(Number),
            transitMode: TransitMode.WALKING,
          }),
        }),
      );
    });
  });
});
