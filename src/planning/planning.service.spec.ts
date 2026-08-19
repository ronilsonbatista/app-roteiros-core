import { Test, TestingModule } from '@nestjs/testing';
import { PlanningService } from './planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GuestJourneyStatus, BudgetLevel, ProductType, ItineraryCategory } from '@prisma/client';
import { PlanningInterest } from './enums/planning-interests.enum';

describe('PlanningService', () => {
  let service: PlanningService;
  let prismaMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      guestJourney: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
      },
      baseTrip: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    aiServiceMock = {
      generateGuestItinerary: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiService, useValue: aiServiceMock },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
  });

  describe('createSession', () => {
    it('should create guest session, return raw token ONCE, and store SHA-256 hash', async () => {
      const mockCreated = {
        id: 'journey-uuid-1',
        guestTokenHash: 'mock-sha256-hash',
        status: GuestJourneyStatus.COLLECTING,
        answersVersion: 1,
        currentStep: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.guestJourney.create.mockResolvedValue(mockCreated);

      const result = await service.createSession({ answersVersion: 1 });

      expect(result.id).toBe('journey-uuid-1');
      expect(result.guestToken).toBeDefined();
      expect(result.guestToken.length).toBe(64); // 32 bytes hex = 64 chars
      expect(prismaMock.guestJourney.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSession', () => {
    it('should return session data when valid', async () => {
      const mockJourney = {
        id: 'journey-uuid-1',
        status: GuestJourneyStatus.COLLECTING,
        answersVersion: 1,
        currentStep: 2,
        expiresAt: new Date(Date.now() + 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.getSession('journey-uuid-1', mockJourney);
      expect(result.id).toBe('journey-uuid-1');
      expect(result.currentStep).toBe(2);
    });

    it('should throw PLANNING_JOURNEY_EXPIRED if session expired', async () => {
      const mockJourney = {
        id: 'journey-uuid-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() - 1000),
      };

      prismaMock.guestJourney.update.mockResolvedValue({});

      await expect(
        service.getSession('journey-uuid-1', mockJourney),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateProgress', () => {
    it('should update destinations and validate dates', async () => {
      const mockJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
      };

      const validDestinations = [
        {
          name: 'Roma',
          arrivalDate: '2026-07-25',
          arrivalTime: '11:00',
          departureDate: '2026-07-28',
          departureTime: '19:00',
        },
      ];

      prismaMock.guestJourney.update.mockResolvedValue({
        ...mockJourney,
        destinations: validDestinations,
        currentStep: 2,
      });

      const result = await service.updateProgress(
        'journey-1',
        { destinations: validDestinations, currentStep: 2 },
        mockJourney,
      );

      expect(result.destinations).toEqual(validDestinations);
      expect(result.currentStep).toBe(2);
    });

    it('should throw BadRequestException if arrivalDate >= departureDate', async () => {
      const mockJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
      };

      const invalidDestinations = [
        {
          name: 'Roma',
          arrivalDate: '2026-07-28',
          arrivalTime: '11:00',
          departureDate: '2026-07-25',
          departureTime: '19:00',
        },
      ];

      await expect(
        service.updateProgress(
          'journey-1',
          { destinations: invalidDestinations },
          mockJourney,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if total travelers <= 0', async () => {
      const mockJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.updateProgress(
          'journey-1',
          { travelers: { adults: 0, children: 0, elders: 0 } },
          mockJourney,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw PLANNING_JOURNEY_LOCKED if status is READY_TO_GENERATE', async () => {
      const mockJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.READY_TO_GENERATE,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.updateProgress(
          'journey-1',
          { currentStep: 3 },
          mockJourney,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finalizeQuestionnaire', () => {
    it('should throw PLANNING_INCOMPLETE if required sections missing', async () => {
      const incompleteJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma', arrivalDate: '2026-07-25', departureDate: '2026-07-28' }],
        travelers: null, // missing
      };

      await expect(
        service.finalizeQuestionnaire('journey-1', incompleteJourney),
      ).rejects.toThrow(BadRequestException);
    });

    it('should finalize complete questionnaire and transition status to READY_TO_GENERATE', async () => {
      const completeJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma', arrivalDate: '2026-07-25', departureDate: '2026-07-28' }],
        travelers: { adults: 2, children: 1, elders: 0 },
        interests: [PlanningInterest.GASTRONOMY, PlanningInterest.NATURE],
        activityHours: { startTime: '09:00', endTime: '18:30' },
        budgetLevel: BudgetLevel.MEDIUM,
      };

      prismaMock.guestJourney.update.mockResolvedValue({
        ...completeJourney,
        status: GuestJourneyStatus.READY_TO_GENERATE,
        currentStep: 6,
      });

      const result = await service.finalizeQuestionnaire('journey-1', completeJourney);

      expect(result.status).toBe(GuestJourneyStatus.READY_TO_GENERATE);
      expect(result.currentStep).toBe(6);
    });
  });

  describe('startGeneration', () => {
    it('should start generation asynchronously when status is READY_TO_GENERATE', async () => {
      const readyJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.READY_TO_GENERATE,
        expiresAt: new Date(Date.now() + 100000),
      };

      const generatingJourney = {
        ...readyJourney,
        status: GuestJourneyStatus.GENERATING,
        generationStartedAt: new Date(),
      };

      prismaMock.guestJourney.update.mockResolvedValue(generatingJourney);

      const result = await service.startGeneration('journey-1', readyJourney);

      expect(result.status).toBe(GuestJourneyStatus.GENERATING);
      expect(prismaMock.guestJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-1' },
        data: expect.objectContaining({
          status: GuestJourneyStatus.GENERATING,
        }),
      });
      expect(aiServiceMock.generateGuestItinerary).toHaveBeenCalled();
    });

    it('should return current status idempotently when already GENERATING', async () => {
      const generatingJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.GENERATING,
        generationStartedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      };

      const result = await service.startGeneration('journey-1', generatingJourney);

      expect(result.status).toBe(GuestJourneyStatus.GENERATING);
      expect(prismaMock.guestJourney.update).not.toHaveBeenCalled();
    });

    it('should throw PLANNING_NOT_READY_FOR_GENERATION if status is COLLECTING', async () => {
      const collectingJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.startGeneration('journey-1', collectingJourney),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce 60s cooldown if status is FAILED and generationFailedAt is recent', async () => {
      const failedJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.FAILED,
        generationFailedAt: new Date(Date.now() - 10000), // 10s ago
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.startGeneration('journey-1', failedJourney),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGenerationStatus', () => {
    it('should return generation metadata without full itinerary', async () => {
      const generatingJourney = {
        id: 'journey-1',
        status: GuestJourneyStatus.GENERATING,
        generationStartedAt: new Date('2026-08-18T15:00:00Z'),
        expiresAt: new Date(Date.now() + 100000),
      };

      const result = await service.getGenerationStatus('journey-1', generatingJourney);

      expect(result.id).toBe('journey-1');
      expect(result.status).toBe(GuestJourneyStatus.GENERATING);
      expect(result).not.toHaveProperty('generatedItinerary');
    });
  });

  describe('getPreview (Phase H1 Core Preview & Server-Side Anti-Leakage)', () => {
    const mockMultiDayItinerary = {
      days: [
        {
          dayNumber: 1,
          date: '2026-07-25',
          destination: 'Roma',
          title: 'Dia 1: Chegada em Roma',
          description: 'Primeiro dia de passeios',
          items: [
            {
              title: 'Coliseu',
              description: 'Visita guiada ao monumento histórico',
              category: ItineraryCategory.TOURIST_ATTRACTION,
              period: 'Manhã',
              cost: 20,
              order: 1,
              location: 'Piazza del Colosseo',
              latitude: 41.8902,
              longitude: 12.4922,
              providerPlaceId: 'place-coliseu-123',
              sourceType: 'BASE_ATTRACTION',
              sourceId: 'base-attr-coliseu',
            },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-07-26',
          destination: 'Roma',
          title: 'Dia 2: Arte Sacra no Vaticano',
          description: 'Visita aos Museus do Vaticano',
          items: [
            {
              title: 'Museu do Louvre Secreto de Roma',
              description: 'Galeria privada e secreta',
              category: ItineraryCategory.MUSEUM,
              period: 'Manhã',
              cost: 30,
              order: 1,
            },
          ],
        },
        {
          dayNumber: 3,
          date: '2026-07-27',
          destination: 'Roma',
          title: 'Dia 3: Torre Eiffel Fictícia',
          description: 'Passeio noturno privado',
          items: [
            {
              title: 'Torre Eiffel Romana',
              description: 'Jantar romântico secreto',
              category: ItineraryCategory.RESTAURANT,
              period: 'Noite',
              cost: 100,
              order: 1,
            },
          ],
        },
      ],
    };

    it('SERVER-SIDE ANTI-LEAKAGE: should return Day 1 visible and ZERO private activity content for locked days in JSON', async () => {
      const readyJourney = {
        id: 'journey-preview-123',
        status: GuestJourneyStatus.PREVIEW_READY,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma', arrivalDate: '2026-07-25', departureDate: '2026-07-27' }],
        generatedItinerary: mockMultiDayItinerary,
      };

      prismaMock.product.findFirst.mockResolvedValue({
        id: 'prod-full-access',
        type: ProductType.ITINERARY_FULL_ACCESS,
        name: 'Desbloqueio Completo 2GO',
        price: 19.99,
        currency: 'BRL',
        active: true,
      });

      const result = await service.getPreview('journey-preview-123', readyJourney);

      expect(result.id).toBe('journey-preview-123');
      expect(result.status).toBe(GuestJourneyStatus.PREVIEW_READY);
      expect(result.visibleDays).toHaveLength(1);
      expect(result.lockedDays).toHaveLength(2);

      // Check Visible Day 1
      expect(result.visibleDays[0].dayNumber).toBe(1);
      expect(result.visibleDays[0].activities[0].title).toBe('Coliseu');
      expect(result.visibleDays[0].activities[0].sourceType).toBe('BASE_ATTRACTION');
      expect(result.visibleDays[0].activities[0].providerPlaceId).toBe('place-coliseu-123');

      // Check Locked Days (Day 2 & 3) minimal metadata
      expect(result.lockedDays[0].dayNumber).toBe(2);
      expect(result.lockedDays[0].locked).toBe(true);
      expect(result.lockedDays[0]).not.toHaveProperty('activities');
      expect(result.lockedDays[1].dayNumber).toBe(3);
      expect(result.lockedDays[1].locked).toBe(true);
      expect(result.lockedDays[1]).not.toHaveProperty('activities');

      // CRITICAL ANTI-LEAKAGE ASSERTION: Serialized JSON MUST NOT CONTAIN locked day titles/activities
      const serializedJson = JSON.stringify(result);
      expect(serializedJson).toContain('Coliseu');
      expect(serializedJson).not.toContain('Museu do Louvre Secreto de Roma');
      expect(serializedJson).not.toContain('Torre Eiffel Romana');
      expect(serializedJson).not.toContain('Galeria privada e secreta');
      expect(serializedJson).not.toContain('Jantar romântico secreto');
    });

    it('POLICY CONFIGURABILITY: should respect visibleDayCount when policy is changed in Core', async () => {
      const readyJourney = {
        id: 'journey-preview-config',
        status: GuestJourneyStatus.PREVIEW_READY,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma' }],
        generatedItinerary: mockMultiDayItinerary,
      };

      prismaMock.product.findFirst.mockResolvedValue(null);

      // Change policy configuration in Core to 2 visible days
      service.setVisibleDayCountConfig(2);

      const result = await service.getPreview('journey-preview-config', readyJourney);

      expect(result.previewPolicy.visibleDayCount).toBe(2);
      expect(result.visibleDays).toHaveLength(2);
      expect(result.lockedDays).toHaveLength(1);

      // Reset policy to 1 day default
      service.setVisibleDayCountConfig(1);
    });

    it('PRODUCT OFFER: should load active product from database or use available=false fallback if missing', async () => {
      const readyJourney = {
        id: 'journey-preview-product',
        status: GuestJourneyStatus.PREVIEW_READY,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma' }],
        generatedItinerary: mockMultiDayItinerary,
      };

      // Case 1: Active Product in Database
      prismaMock.product.findFirst.mockResolvedValue({
        id: 'prod-custom-99',
        type: ProductType.ITINERARY_FULL_ACCESS,
        name: 'Acesso Premium Especial',
        price: 24.9,
        currency: 'BRL',
        active: true,
      });

      const res1 = await service.getPreview('journey-preview-product', readyJourney);
      expect(res1.unlockOffer.available).toBe(true);
      expect(res1.unlockOffer.price).toBe(24.9);
      expect(res1.unlockOffer.name).toBe('Acesso Premium Especial');

      // Case 2: Inactive or Missing Product in Database
      prismaMock.product.findFirst.mockResolvedValue(null);

      const res2 = await service.getPreview('journey-preview-product', readyJourney);
      expect(res2.unlockOffer.available).toBe(false);
      expect(res2.unlockOffer.code).toBe(ProductType.ITINERARY_FULL_ACCESS);
    });

    it('SECURITY & STATUS CONSTRAINTS: should reject preview when status is not PREVIEW_READY or CLAIMED', async () => {
      const collectingJourney = {
        id: 'journey-preview-invalid',
        status: GuestJourneyStatus.COLLECTING,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.getPreview('journey-preview-invalid', collectingJourney),
      ).rejects.toThrow(BadRequestException);

      const failedJourney = {
        id: 'journey-preview-failed',
        status: GuestJourneyStatus.FAILED,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.getPreview('journey-preview-failed', failedJourney),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('claimJourney (Phase I1 Core Guest Journey Claim + Materialization)', () => {
    const mockFullItinerary = {
      days: [
        {
          dayNumber: 1,
          date: '2026-07-25',
          destination: 'Roma',
          title: 'Dia 1: Chegada em Roma',
          items: [
            {
              title: 'Coliseu de Roma',
              description: 'Passeio Histórico Guiado',
              category: ItineraryCategory.TOURIST_ATTRACTION,
              period: 'Manhã',
              cost: 25.0,
              order: 1,
              sourceType: 'BASE_ATTRACTION',
              providerPlaceId: 'coliseu-place-1',
            },
          ],
        },
        {
          dayNumber: 2,
          date: '2026-07-26',
          destination: 'Roma',
          title: 'Dia 2: Vaticano',
          items: [
            {
              title: 'Museus do Vaticano',
              description: 'Capela Sistina',
              category: ItineraryCategory.MUSEUM,
              period: 'Tarde',
              cost: 30.0,
              order: 1,
              sourceType: 'BASE_ATTRACTION',
              providerPlaceId: 'vaticano-place-2',
            },
          ],
        },
      ],
    };

    it('ATOMIC MATERIALIZATION: should materialize Trip, TripDays, ItineraryItems and update status to CLAIMED with premiumUnlockedAt=null', async () => {
      const readyJourney = {
        id: 'journey-claim-1',
        status: GuestJourneyStatus.PREVIEW_READY,
        expiresAt: new Date(Date.now() + 100000),
        destinations: [{ name: 'Roma', arrivalDate: '2026-07-25', departureDate: '2026-07-26' }],
        generatedItinerary: mockFullItinerary,
        claimedUserId: null,
        createdTripId: null,
      };

      const mockCreatedTrip = {
        id: 'trip-materialized-123',
        userId: 'user-auth-456',
        title: 'Viagem para Roma',
        destination: 'Roma',
        premiumUnlockedAt: null,
      };

      const mockCreatedDay1 = { id: 'day-1-uuid', tripId: 'trip-materialized-123', dayNumber: 1 };
      const mockCreatedDay2 = { id: 'day-2-uuid', tripId: 'trip-materialized-123', dayNumber: 2 };

      const txMock = {
        guestJourney: {
          findUnique: jest.fn().mockResolvedValue(readyJourney),
          update: jest.fn().mockResolvedValue({ ...readyJourney, status: GuestJourneyStatus.CLAIMED, claimedUserId: 'user-auth-456', createdTripId: 'trip-materialized-123' }),
        },
        baseTrip: { findFirst: jest.fn().mockResolvedValue(null) },
        trip: { create: jest.fn().mockResolvedValue(mockCreatedTrip) },
        tripDay: {
          create: jest.fn()
            .mockResolvedValueOnce(mockCreatedDay1)
            .mockResolvedValueOnce(mockCreatedDay2),
        },
        itineraryItem: { create: jest.fn().mockResolvedValue({}) },
      };

      prismaMock.$transaction = jest.fn().mockImplementation((cb) => cb(txMock));

      const result = await service.claimJourney('journey-claim-1', 'user-auth-456', readyJourney);

      expect(result.journeyId).toBe('journey-claim-1');
      expect(result.tripId).toBe('trip-materialized-123');
      expect(result.status).toBe(GuestJourneyStatus.CLAIMED);
      expect(result.nextAction).toBe('CHECKOUT');

      // Assert zero AI calls during claim
      expect(aiServiceMock.generateGuestItinerary).not.toHaveBeenCalled();

      // Assert Trip materialized with user owner from JWT and premiumUnlockedAt=null
      expect(txMock.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-auth-456',
          destination: 'Roma',
          premiumUnlockedAt: null,
        }),
      });

      // Assert all days materialized
      expect(txMock.tripDay.create).toHaveBeenCalledTimes(2);
      expect(txMock.itineraryItem.create).toHaveBeenCalledTimes(2);

      // Assert GuestJourney linked and status updated to CLAIMED
      expect(txMock.guestJourney.update).toHaveBeenCalledWith({
        where: { id: 'journey-claim-1' },
        data: {
          claimedUserId: 'user-auth-456',
          createdTripId: 'trip-materialized-123',
          status: GuestJourneyStatus.CLAIMED,
        },
      });
    });

    it('IDEMPOTENCY (SAME USER): re-claiming by same user returns existing tripId without creating new Trip', async () => {
      const alreadyClaimedJourney = {
        id: 'journey-claim-idempotent',
        status: GuestJourneyStatus.CLAIMED,
        expiresAt: new Date(Date.now() + 100000),
        claimedUserId: 'user-auth-456',
        createdTripId: 'trip-existing-999',
        generatedItinerary: mockFullItinerary,
      };

      const result = await service.claimJourney(
        'journey-claim-idempotent',
        'user-auth-456',
        alreadyClaimedJourney,
      );

      expect(result.journeyId).toBe('journey-claim-idempotent');
      expect(result.tripId).toBe('trip-existing-999');
      expect(result.status).toBe(GuestJourneyStatus.CLAIMED);
      expect(result.nextAction).toBe('CHECKOUT');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('REJECTION (DIFFERENT USER): claiming a journey already claimed by another user throws PLANNING_JOURNEY_ALREADY_CLAIMED', async () => {
      const claimedByOtherUser = {
        id: 'journey-claimed-other',
        status: GuestJourneyStatus.CLAIMED,
        expiresAt: new Date(Date.now() + 100000),
        claimedUserId: 'user-original-owner-111',
        createdTripId: 'trip-other-user',
      };

      await expect(
        service.claimJourney('journey-claimed-other', 'user-intruder-999', claimedByOtherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('INELIGIBLE STATUS: claiming in status GENERATING or FAILED throws PLANNING_JOURNEY_NOT_CLAIMABLE', async () => {
      const generatingJourney = {
        id: 'journey-generating',
        status: GuestJourneyStatus.GENERATING,
        expiresAt: new Date(Date.now() + 100000),
      };

      await expect(
        service.claimJourney('journey-generating', 'user-1', generatingJourney),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

