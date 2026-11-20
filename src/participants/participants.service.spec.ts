import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ParticipantsService', () => {
  let service: ParticipantsService;
  let prisma: any;

  const ownerId = 'owner_1';
  const tripId = 'trip_1';
  const guestEmail = 'guest@2go.com';

  beforeEach(async () => {
    prisma = {
      trip: {
        findUnique: jest.fn(),
      },
      tripParticipant: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ParticipantsService);
  });

  describe('invite', () => {
    it('creates pending participant with normalized email', async () => {
      prisma.trip.findUnique.mockResolvedValue({ id: tripId, userId: ownerId });
      prisma.tripParticipant.findUnique.mockResolvedValue(null);
      prisma.tripParticipant.create.mockResolvedValue({
        id: 'p1',
        tripId,
        email: guestEmail,
      });

      const result = await service.invite(ownerId, tripId, {
        email: 'Guest@2GO.com',
      });

      expect(result.participantId).toBe('p1');
      expect(prisma.tripParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: guestEmail,
            invitedById: ownerId,
            tripId,
          }),
        }),
      );
    });

    it('rejects non-owner', async () => {
      prisma.trip.findUnique.mockResolvedValue({ id: tripId, userId: ownerId });
      await expect(
        service.invite('other', tripId, { email: guestEmail }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('acceptInvite', () => {
    it('accepts matching email invite', async () => {
      prisma.tripParticipant.findUnique.mockResolvedValue({
        id: 'p1',
        tripId,
        email: guestEmail,
        accepted: false,
        inviteToken: 'tok',
        trip: { id: tripId },
      });
      prisma.tripParticipant.update.mockResolvedValue({});

      const result = await service.acceptInvite('user_g', 'Guest@2go.com', {
        inviteToken: 'tok',
      });

      expect(result.tripId).toBe(tripId);
      expect(prisma.tripParticipant.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { accepted: true, acceptedById: 'user_g' },
      });
    });

    it('rejects already accepted', async () => {
      prisma.tripParticipant.findUnique.mockResolvedValue({
        id: 'p1',
        accepted: true,
        email: guestEmail,
        inviteToken: 'tok',
        trip: { id: tripId },
      });
      await expect(
        service.acceptInvite('user_g', guestEmail, { inviteToken: 'tok' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('claimPendingInvites', () => {
    it('marks pending invites accepted for email', async () => {
      prisma.tripParticipant.updateMany.mockResolvedValue({ count: 2 });
      const count = await service.claimPendingInvites('user_g', guestEmail);
      expect(count).toBe(2);
      expect(prisma.tripParticipant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { accepted: true, acceptedById: 'user_g' },
        }),
      );
    });
  });

  describe('listPendingWelcomes / markWelcomeSeen', () => {
    it('lists accepted guest trips without welcomeSeenAt', async () => {
      prisma.tripParticipant.findMany.mockResolvedValue([
        {
          id: 'p1',
          tripId,
          role: 'VIEWER',
          welcomeSeenAt: null,
          trip: {
            id: tripId,
            title: 'Roma',
            destination: 'Roma',
            coverImage: null,
          },
        },
      ]);

      const result = await service.listPendingWelcomes('user_g');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        tripId,
        participantId: 'p1',
        isGuest: true,
        welcomeSeenAt: null,
      });
    });

    it('marks welcome seen and keeps membership', async () => {
      prisma.tripParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        tripId,
        acceptedById: 'user_g',
        accepted: true,
        welcomeSeenAt: null,
      });
      const seenAt = new Date('2026-11-20T16:00:00.000Z');
      prisma.tripParticipant.update.mockResolvedValue({
        id: 'p1',
        tripId,
        welcomeSeenAt: seenAt,
      });

      const result = await service.markWelcomeSeen('user_g', tripId);
      expect(result).toEqual({
        tripId,
        participantId: 'p1',
        isGuest: true,
        welcomeSeenAt: seenAt,
      });
      expect(prisma.tripParticipant.delete).not.toHaveBeenCalled();
    });

    it('is idempotent when already seen', async () => {
      const seenAt = new Date('2026-11-19T10:00:00.000Z');
      prisma.tripParticipant.findFirst.mockResolvedValue({
        id: 'p1',
        tripId,
        welcomeSeenAt: seenAt,
      });

      const result = await service.markWelcomeSeen('user_g', tripId);
      expect(result.welcomeSeenAt).toEqual(seenAt);
      expect(prisma.tripParticipant.update).not.toHaveBeenCalled();
    });

    it('404 when no accepted guest membership', async () => {
      prisma.tripParticipant.findFirst.mockResolvedValue(null);
      await expect(
        service.markWelcomeSeen('user_g', tripId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSharedTrips', () => {
    it('returns trips with guest tag metadata', async () => {
      prisma.tripParticipant.findMany.mockResolvedValue([
        {
          id: 'p1',
          role: 'VIEWER',
          welcomeSeenAt: null,
          trip: { id: tripId, title: 'Roma' },
        },
      ]);
      const result = await service.getSharedTrips('user_g');
      expect(result[0]).toMatchObject({
        id: tripId,
        title: 'Roma',
        isGuest: true,
        participantId: 'p1',
        role: 'VIEWER',
      });
    });
  });
});
