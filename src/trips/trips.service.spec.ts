import { Test, TestingModule } from '@nestjs/testing';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { isTripLocked } from './trips.util';

describe('TripsService Entitlement & Security Audit (Phase M.1)', () => {
  let service: TripsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    trip: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('isTripLocked Policy Unit Tests', () => {
    it('should return true for unpaid product trip', () => {
      const trip = {
        createdFromGuestJourneys: [{ id: 'gj_1' }],
        purchases: [],
        premiumUnlockedAt: null,
      };
      expect(isTripLocked(trip)).toBe(true);
    });

    it('should return false for paid product trip', () => {
      const trip = {
        createdFromGuestJourneys: [{ id: 'gj_1' }],
        purchases: [{ id: 'pur_1' }],
        premiumUnlockedAt: new Date(),
      };
      expect(isTripLocked(trip)).toBe(false);
    });

    it('should return false for normal legacy trip without guest journey or purchases', () => {
      const trip = {
        createdFromGuestJourneys: [],
        purchases: [],
        premiumUnlockedAt: null,
      };
      expect(isTripLocked(trip)).toBe(false);
    });
  });

  describe('findOne Entitlement Control', () => {
    const ownerUserId = 'usr_owner_123';
    const otherUserId = 'usr_other_999';

    const mockUnpaidProductTrip = {
      id: 'trip_unpaid_1',
      userId: ownerUserId,
      title: 'Paris Preview Trip',
      destination: 'Paris',
      premiumUnlockedAt: null,
      createdFromGuestJourneys: [{ id: 'gj_100' }],
      purchases: [],
      participants: [],
      days: [
        {
          id: 'day_1',
          dayNumber: 1,
          title: 'Dia 1 - Chegada',
          items: [{ id: 'item_1_1', title: 'Torre Eiffel' }],
        },
        {
          id: 'day_2',
          dayNumber: 2,
          title: 'Dia 2 - Museu do Louvre',
          items: [{ id: 'item_2_1', title: 'Mona Lisa (Premium)' }],
        },
      ],
    };

    it('1. Owner + Unpaid: Day 1 preview items visible, Day 2+ items stripped', async () => {
      mockPrismaService.trip.findUnique.mockResolvedValue(mockUnpaidProductTrip);

      const result = await service.findOne(ownerUserId, 'trip_unpaid_1');

      expect(result.days.length).toBe(2);
      expect(result.days[0].items.length).toBe(1); // Day 1 visible preview
      expect(result.days[0].items[0].title).toBe('Torre Eiffel');
      expect(result.days[1].items.length).toBe(0); // Day 2+ stripped
    });

    it('2. Owner + PAID: All days and items returned 100%', async () => {
      const mockPaidProductTrip = {
        ...mockUnpaidProductTrip,
        premiumUnlockedAt: new Date(),
        purchases: [{ id: 'pur_paid_1' }],
      };
      mockPrismaService.trip.findUnique.mockResolvedValue(mockPaidProductTrip);

      const result = await service.findOne(ownerUserId, 'trip_unpaid_1');

      expect(result.days[0].items.length).toBe(1);
      expect(result.days[1].items.length).toBe(1);
      expect(result.days[1].items[0].title).toBe('Mona Lisa (Premium)');
    });

    it('3. Legacy Trip: Normal legacy trip returned 100% without entitlement blocking', async () => {
      const mockLegacyTrip = {
        id: 'trip_legacy_1',
        userId: ownerUserId,
        title: 'Minha Viagem Antiga',
        destination: 'Roma',
        premiumUnlockedAt: null,
        createdFromGuestJourneys: [],
        purchases: [],
        participants: [],
        days: [
          { id: 'd1', dayNumber: 1, items: [{ id: 'i1', title: 'Coliseu' }] },
          { id: 'd2', dayNumber: 2, items: [{ id: 'i2', title: 'Vaticano' }] },
        ],
      };
      mockPrismaService.trip.findUnique.mockResolvedValue(mockLegacyTrip);

      const result = await service.findOne(ownerUserId, 'trip_legacy_1');

      expect(result.days[0].items.length).toBe(1);
      expect(result.days[1].items.length).toBe(1);
    });

    it('4. Other User: Non-owner gets ForbiddenException', async () => {
      mockPrismaService.trip.findUnique.mockResolvedValue(mockUnpaidProductTrip);

      await expect(
        service.findOne(otherUserId, 'trip_unpaid_1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
