import { Test, TestingModule } from '@nestjs/testing';
import { ItineraryService } from './itinerary.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BaseTripStatus, ItineraryCategory, TicketStatus, TransitMode } from '@prisma/client';

describe('ItineraryService (Phase 3 Controls & Substitutions)', () => {
  let service: ItineraryService;
  let prismaMock: any;
  let placesServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      itineraryItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      trip: {
        update: jest.fn(),
      },
      tripDay: {
        findUnique: jest.fn(),
      },
      baseTrip: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    placesServiceMock = {
      getPlaceDetails: jest.fn().mockImplementation((placeId: string) => {
        if (placeId === 'fake-id') {
          return Promise.reject(new NotFoundException('Place not found'));
        }
        return Promise.resolve({
          provider: 'GOOGLE',
          providerPlaceId: placeId,
          name: 'Coliseu Romano',
          formattedAddress: 'Piazza del Colosseo, 1, 00184 Roma',
          rating: 4.8,
          userRatingsTotal: 345000,
          googleMapsUri: 'https://maps.google.com/?cid=123',
          priceLevel: 'PRICE_LEVEL_MODERATE',
          priceLevelDisplay: '$$',
          openingHoursText: '09:00-19:00',
          editorialSummary: 'O maior anfiteatro do mundo.',
          photos: [
            {
              name: 'places/x/photos/y',
              photoUri: 'https://lh3.googleusercontent.com/photo',
            },
          ],
          reviews: [
            {
              rating: 4,
              text: 'Experiência incrível',
              authorName: 'Rachel Mendonça',
            },
          ],
          latitude: 41.8902,
          longitude: 12.4922,
        });
      }),
      searchPlaces: jest.fn().mockResolvedValue([
        {
          name: 'Panteão de Roma',
          formattedAddress: 'Piazza della Rotonda, 00186 Roma',
          providerPlaceId: 'place-panteao',
          rating: 4.8,
          userRatingsTotal: 120000,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItineraryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlacesService, useValue: placesServiceMock },
      ],
    }).compile();

    service = module.get<ItineraryService>(ItineraryService);
    jest.clearAllMocks();
  });

  describe('findOne (Verified Item Detail)', () => {
    it('should return item with verified Google Places data when providerPlaceId exists', async () => {
      const mockItem = {
        id: 'item-coliseu',
        title: 'Coliseu',
        providerPlaceId: 'place-coliseu',
        ticketStatus: TicketStatus.TICKET_REQUIRED,
        tripDay: {
          dayNumber: 1,
          trip: { userId: 'user-1', createdFromGuestJourneys: [], purchases: [] },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);

      const result = await service.findOne({ userId: 'user-1' }, 'item-coliseu');

      expect(result.verifiedDetails).toEqual(
        expect.objectContaining({
          name: 'Coliseu Romano',
          rating: 4.8,
          formattedAddress: expect.any(String),
          priceLevelDisplay: '$$',
          openingHoursText: '09:00-19:00',
          photos: expect.arrayContaining([
            expect.objectContaining({
              photoUri: 'https://lh3.googleusercontent.com/photo',
            }),
          ]),
          reviews: expect.arrayContaining([
            expect.objectContaining({ authorName: 'Rachel Mendonça' }),
          ]),
        }),
      );
      expect(result.ticketStatus).toBe(TicketStatus.TICKET_REQUIRED);
    });

    it('should return verifiedDetails null if providerPlaceId is absent', async () => {
      const mockItem = {
        id: 'item-plain',
        title: 'Caminhada',
        providerPlaceId: null,
        tripDay: {
          dayNumber: 1,
          trip: { userId: 'user-1', createdFromGuestJourneys: [], purchases: [] },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);

      const result = await service.findOne({ userId: 'user-1' }, 'item-plain');

      expect(result.verifiedDetails).toBeNull();
    });
  });

  describe('update (Duration & Schedule Recalculation)', () => {
    it('should update duration and recalculate subsequent day timeLabels', async () => {
      const mockItem = {
        id: 'item-1',
        tripDayId: 'day-1',
        duration: 60,
        tripDay: {
          dayNumber: 1,
          trip: { userId: 'user-1', createdFromGuestJourneys: [], purchases: [] },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.itineraryItem.findMany.mockResolvedValue([
        { id: 'item-1', timeLabel: '09:00 - 10:00', duration: 90, transitDurationMinutes: 15 },
        { id: 'item-2', timeLabel: '10:15 - 11:15', duration: 60, transitDurationMinutes: 10 },
      ]);
      prismaMock.itineraryItem.update.mockResolvedValue({ id: 'item-1', duration: 90 });

      await service.update({ userId: 'user-1' }, 'item-1', { duration: 90 });

      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({ duration: 90, isUserModified: true }),
        }),
      );
    });
  });

  describe('getAlternatives & substitute (Swap Quota)', () => {
    it('should return alternatives from published base trips and Places with current quota', async () => {
      const mockItem = {
        id: 'item-swap-1',
        title: 'Atração Atual',
        category: ItineraryCategory.TOURIST_ATTRACTION,
        tripDayId: 'day-1',
        tripDay: {
          dayNumber: 1,
          trip: {
            id: 'trip-1',
            userId: 'user-1',
            destination: 'Roma',
            allowedSwapsCount: 4,
            usedSwapsCount: 1,
            createdFromGuestJourneys: [],
            purchases: [],
          },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.itineraryItem.findMany.mockResolvedValue([{ title: 'Atração Atual' }]);
      prismaMock.baseTrip.findMany.mockResolvedValue([
        {
          id: 'base-1',
          days: [
            {
              attractions: [
                {
                  id: 'attr-1',
                  name: 'Fórum Romano',
                  category: ItineraryCategory.TOURIST_ATTRACTION,
                  address: 'Via dei Fori Imperiali',
                  providerPlaceId: 'place-forum',
                  requiresTicket: true,
                },
              ],
            },
          ],
        },
      ]);

      const result = await service.getAlternatives({ userId: 'user-1' }, 'item-swap-1');

      expect(result.quota).toEqual({
        allowedSwapsCount: 4,
        usedSwapsCount: 1,
        remainingSwaps: 3,
      });
      expect(result.items.some((i: any) => i.title === 'Fórum Romano')).toBe(true);
      expect(result.items.some((i: any) => i.title === 'Panteão de Roma')).toBe(true);
    });

    it('should substitute item, decrement remaining quota (increment usedSwapsCount), and recalculate schedule', async () => {
      const mockItem = {
        id: 'item-swap-1',
        tripDayId: 'day-1',
        tripDay: {
          id: 'day-1',
          dayNumber: 1,
          trip: {
            id: 'trip-1',
            userId: 'user-1',
            allowedSwapsCount: 4,
            usedSwapsCount: 2,
            accommodation: null,
            createdFromGuestJourneys: [],
            purchases: [],
          },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day-1',
        dayNumber: 1,
        trip: { accommodation: null },
        items: [],
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([]);

      const result = await service.substitute({ userId: 'user-1' }, 'item-swap-1', {
        title: 'Fórum Romano',
        category: ItineraryCategory.TOURIST_ATTRACTION,
        providerPlaceId: 'place-forum',
        duration: 90,
      });

      expect(prismaMock.trip.update).toHaveBeenCalledWith({
        where: { id: 'trip-1' },
        data: { usedSwapsCount: 3 },
      });
      expect(result.quota).toEqual({
        allowedSwapsCount: 4,
        usedSwapsCount: 3,
        remainingSwaps: 1,
      });
    });

    it('should reject substitution when quota is exhausted', async () => {
      const mockItem = {
        id: 'item-swap-exhausted',
        tripDay: {
          dayNumber: 1,
          trip: {
            id: 'trip-1',
            userId: 'user-1',
            allowedSwapsCount: 4,
            usedSwapsCount: 4, // exhausted!
            createdFromGuestJourneys: [],
            purchases: [],
          },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);

      await expect(
        service.substitute({ userId: 'user-1' }, 'item-swap-exhausted', {
          title: 'Outro Local',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('pinMeal (Fixing Recommended Meal)', () => {
    it('should pin recommended restaurant onto meal item with verified data', async () => {
      const mockItem = {
        id: 'item-meal-1',
        tripDayId: 'day-1',
        category: ItineraryCategory.RESTAURANT,
        tripDay: {
          id: 'day-1',
          dayNumber: 1,
          trip: { userId: 'user-1', accommodation: null, createdFromGuestJourneys: [], purchases: [] },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day-1',
        dayNumber: 1,
        trip: { accommodation: null },
        items: [],
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([]);
      prismaMock.itineraryItem.update.mockResolvedValue({
        id: 'item-meal-1',
        title: 'Trattoria Da Enzo al 29',
        category: ItineraryCategory.RESTAURANT,
      });

      const result = await service.pinMeal({ userId: 'user-1' }, 'item-meal-1', {
        title: 'Trattoria Da Enzo al 29',
        location: 'Via dei Vascellari, 29',
        providerPlaceId: 'place-enzo-123',
        imageUrl: 'https://cdn.example/enzo.jpg',
        priceRange: '$$',
        rating: 4.7,
        notes: 'Carbonara',
      });

      expect(result.message).toContain('sucesso');
      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-meal-1' },
          data: expect.objectContaining({
            title: 'Trattoria Da Enzo al 29',
            category: ItineraryCategory.RESTAURANT,
            ticketStatus: TicketStatus.FREE,
            isUserModified: true,
            externalLink: 'https://cdn.example/enzo.jpg',
          }),
        }),
      );
      const notes = prismaMock.itineraryItem.update.mock.calls[0][0].data.notes;
      expect(notes).toContain('2go-meal-pin:');
      expect(notes).toContain('Carbonara');
    });

    it('should unpin meal and restore Café/Almoço/Jantar slot', async () => {
      const mockItem = {
        id: 'item-meal-1',
        tripDayId: 'day-1',
        title: 'Trattoria Da Enzo al 29',
        period: 'Jantar',
        category: ItineraryCategory.RESTAURANT,
        notes: '2go-meal-pin:{"dish":"Carbonara","mealSlotTitle":"Jantar","mealSlotCategory":"RESTAURANT"}',
        tripDay: {
          id: 'day-1',
          dayNumber: 1,
          trip: { userId: 'user-1', accommodation: null, createdFromGuestJourneys: [], purchases: [] },
        },
      };
      prismaMock.itineraryItem.findUnique.mockResolvedValue(mockItem);
      prismaMock.tripDay.findUnique.mockResolvedValue({
        id: 'day-1',
        dayNumber: 1,
        trip: { accommodation: null },
        items: [],
      });
      prismaMock.itineraryItem.findMany.mockResolvedValue([]);
      prismaMock.itineraryItem.update.mockResolvedValue({
        id: 'item-meal-1',
        title: 'Jantar',
        category: ItineraryCategory.RESTAURANT,
      });

      const result = await service.unpinMeal({ userId: 'user-1' }, 'item-meal-1');
      expect(result.message).toContain('restaurado');
      expect(prismaMock.itineraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-meal-1' },
          data: expect.objectContaining({
            title: 'Jantar',
            providerPlaceId: null,
            externalLink: null,
            notes: null,
            isUserModified: true,
          }),
        }),
      );
    });
  });
});
