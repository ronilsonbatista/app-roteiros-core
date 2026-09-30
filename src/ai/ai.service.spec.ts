import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAIProvider } from './providers/openai.provider';
import { CurationRetrievalService } from './curation/curation-retrieval.service';
import { GuestJourneyStatus, ItineraryCategory } from '@prisma/client';

describe('AiService (Phase G3 AI Orchestration & Provenance)', () => {
  let service: AiService;
  let prismaMock: any;
  let openAIProviderMock: any;
  let curationRetrievalServiceMock: any;

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
      },
      aIRequest: {
        create: jest.fn().mockResolvedValue({ id: 'ai-request-1' }),
      },
      tripDay: {
        create: jest.fn().mockResolvedValue({ id: 'day-1' }),
      },
      itineraryItem: {
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
      guestJourney: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prismaMock.$transaction = jest.fn((fn) => fn(prismaMock));

    openAIProviderMock = {
      generateItinerary: jest.fn(),
      generateGuestItinerary: jest.fn(),
    };

    curationRetrievalServiceMock = {
      retrieveCuratedContext: jest.fn().mockResolvedValue({
        overallCoverage: 'STRONG',
        destinations: [
          {
            destinationName: 'Roma',
            coverage: 'STRONG',
            bestBaseTrip: {
              baseTrip: { id: 'base-trip-roma', title: 'Roma Antiga' },
              score: 50,
            },
            attractions: [
              {
                attraction: {
                  id: 'base-attr-1',
                  name: 'Coliseu',
                  category: 'TOURIST_ATTRACTION',
                  providerPlaceId: 'place-coliseu-123',
                },
              },
            ],
            restaurants: [],
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OpenAIProvider, useValue: openAIProviderMock },
        {
          provide: CurationRetrievalService,
          useValue: curationRetrievalServiceMock,
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('generateGuestItinerary', () => {
    it('should retrieve curated context, generate itinerary via OpenAIProvider, tag provenance, and update status to PREVIEW_READY', async () => {
      const mockJourney = {
        id: 'journey-guest-123',
        destinations: [
          {
            name: 'Roma',
            arrivalDate: '2026-07-25',
            departureDate: '2026-07-25',
          },
        ],
        travelers: { adults: 2, children: 1, elders: 0 },
        interests: ['arte', 'gastronomia'],
        activityHours: { startTime: '09:00', endTime: '18:30' },
        budgetLevel: 'HIGH',
      };

      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            {
              dayNumber: 1,
              date: '2026-07-25',
              destination: 'Roma',
              title: 'Dia 1: Chegada em Roma',
              items: [
                {
                  title: 'Coliseu',
                  description: 'Visita ao monumento histórico',
                  category: 'TOURIST_ATTRACTION',
                  period: 'Manhã',
                  estimatedCost: 20.0,
                  sourceType: 'BASE_ATTRACTION',
                  sourceId: 'base-attr-1',
                  providerPlaceId: 'place-coliseu-123',
                },
                {
                  title: 'Passeio pelo Trastevere',
                  description: 'Caminhada noturna',
                  category: 'TOURIST_ATTRACTION',
                  period: 'Noite',
                  estimatedCost: 0.0,
                  sourceType: 'AI',
                },
              ],
            },
          ],
        },
        tokensUsed: 450,
      });

      await service.generateGuestItinerary(mockJourney);

      expect(
        curationRetrievalServiceMock.retrieveCuratedContext,
      ).toHaveBeenCalled();
      expect(openAIProviderMock.generateGuestItinerary).toHaveBeenCalledWith(
        expect.objectContaining({
          journeyId: 'journey-guest-123',
          curatedContext: expect.objectContaining({
            overallCoverage: 'STRONG',
          }),
        }),
      );

      expect(prismaMock.aIRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestJourneyId: 'journey-guest-123',
            status: 'SUCCESS',
          }),
        }),
      );

      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'journey-guest-123', status: GuestJourneyStatus.GENERATING },
          data: expect.objectContaining({
            status: GuestJourneyStatus.PREVIEW_READY,
            generatedItinerary: expect.objectContaining({
              overallCoverage: 'STRONG',
              days: expect.arrayContaining([
                expect.objectContaining({
                  items: expect.arrayContaining([
                    expect.objectContaining({
                      title: 'Coliseu',
                      sourceType: 'BASE_ATTRACTION',
                      sourceId: 'base-attr-1',
                      providerPlaceId: 'place-coliseu-123',
                    }),
                    expect.objectContaining({
                      title: 'Passeio pelo Trastevere',
                      sourceType: 'AI',
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should fail and NOT become PREVIEW_READY if day count diverges from requested days', async () => {
      const mockJourney = {
        id: 'journey-divergent-days',
        destinations: [
          {
            name: 'Paris',
            numberOfDays: 3,
          },
        ],
      };

      // AI only returned 2 days instead of 3
      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            { dayNumber: 1, items: [{ title: 'Torre Eiffel' }] },
            { dayNumber: 2, items: [{ title: 'Louvre' }] },
          ],
        },
      });

      await service.generateGuestItinerary(mockJourney);

      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'journey-divergent-days', status: GuestJourneyStatus.GENERATING },
          data: expect.objectContaining({
            status: GuestJourneyStatus.FAILED,
          }),
        }),
      );
    });

    it('should fail and NOT become PREVIEW_READY if any day has zero items', async () => {
      const mockJourney = {
        id: 'journey-empty-day',
        destinations: [
          {
            name: 'Madrid',
            numberOfDays: 2,
          },
        ],
      };

      // Day 2 has empty items array
      openAIProviderMock.generateGuestItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            { dayNumber: 1, items: [{ title: 'Prado' }] },
            { dayNumber: 2, items: [] },
          ],
        },
      });

      await service.generateGuestItinerary(mockJourney);

      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'journey-empty-day', status: GuestJourneyStatus.GENERATING },
          data: expect.objectContaining({
            status: GuestJourneyStatus.FAILED,
          }),
        }),
      );
    });

    it('should handle OpenAI generation failure, log AIRequest FAILED, and update status to FAILED', async () => {
      const mockJourney = {
        id: 'journey-guest-fail',
        destinations: [{ name: 'Roma' }],
      };

      openAIProviderMock.generateGuestItinerary.mockRejectedValue(
        new Error('OpenAI Rate Limit Exceeded'),
      );

      await service.generateGuestItinerary(mockJourney);

      expect(prismaMock.aIRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestJourneyId: 'journey-guest-fail',
            status: 'FAILED',
            errorMessage: 'OpenAI Rate Limit Exceeded',
          }),
        }),
      );

      expect(prismaMock.guestJourney.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'journey-guest-fail', status: GuestJourneyStatus.GENERATING },
          data: expect.objectContaining({
            status: GuestJourneyStatus.FAILED,
            generationErrorCode: 'OPENAI_ERROR',
          }),
        }),
      );
    });
  });

  describe('generateItinerary (Authenticated Trip Regression Test)', () => {
    it('should generate itinerary for authenticated Trip without regression', async () => {
      const mockTrip = {
        id: 'trip-auth-1',
        userId: 'user-123',
        destination: 'Lisboa',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-01'),
        updatedAt: new Date('2026-09-01'),
        days: [],
      };

      prismaMock.trip.findUnique.mockResolvedValue(mockTrip);
      prismaMock.userTravelProfile.findUnique.mockResolvedValue(null);

      openAIProviderMock.generateItinerary.mockResolvedValue({
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        parsedData: {
          days: [
            {
              dayNumber: 1,
              title: 'Dia 1 em Lisboa',
              description: 'Chegada',
              items: [
                {
                  title: 'Torre de Belém',
                  description: 'Visita',
                  category: 'TOURIST_ATTRACTION',
                  period: 'Manhã',
                  estimatedCost: 10.0,
                },
              ],
            },
          ],
        },
        tokensUsed: 300,
      });

      const result = await service.generateItinerary(
        'user-123',
        'trip-auth-1',
        {},
      );

      expect(result.message).toContain('sucesso');
      expect(result.aiRequestId).toBe('ai-request-1');
      expect(prismaMock.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            days: {
              create: [
                expect.objectContaining({
                  items: {
                    create: [
                      expect.objectContaining({ title: 'Torre de Belém' }),
                    ],
                  },
                }),
              ],
            },
          },
        }),
      );
      expect(openAIProviderMock.generateItinerary).toHaveBeenCalledWith(
        expect.objectContaining({
          baseTrip: expect.objectContaining({ id: 'base-trip-roma' }),
        }),
      );
    });
  });
});
