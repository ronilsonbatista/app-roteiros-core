import { Test, TestingModule } from '@nestjs/testing';
import { PlanningService } from './planning.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GuestJourneyStatus, BudgetLevel, TravelStyle } from '@prisma/client';
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
});
