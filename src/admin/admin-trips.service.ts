import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from '../trips/dto/create-trip.dto';
import { UpdateTripDto } from '../trips/dto/update-trip.dto';
import { CreateTripDayDto } from '../trip-days/dto/create-trip-day.dto';
import { UpdateTripDayDto } from '../trip-days/dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from '../itinerary/dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from '../itinerary/dto/reorder-itinerary-item.dto';
import { InviteParticipantDto } from '../participants/dto/invite-participant.dto';
import { TripStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class AdminTripsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: {
    userId?: string;
    destination?: string;
    status?: TripStatus;
    premium?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      destination,
      status,
      premium,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (destination) {
      where.destination = { contains: destination, mode: 'insensitive' };
    }

    if (status) {
      where.status = status;
    }

    if (premium !== undefined) {
      if (premium) {
        where.premiumUnlockedAt = { not: null };
      } else {
        where.premiumUnlockedAt = null;
      }
    }

    if (startDate) {
      where.startDate = { gte: new Date(startDate) };
    }

    if (endDate) {
      where.endDate = { lte: new Date(endDate) };
    }

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              photoUrl: true,
            },
          },
          _count: {
            select: {
              days: true,
              participants: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      data: trips,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            photoUrl: true,
            blockedAt: true,
          },
        },
        days: {
          include: {
            items: {
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { dayNumber: 'asc' },
        },
        participants: {
          include: {
            invitedBy: {
              select: { id: true, email: true, fullName: true },
            },
            acceptedBy: {
              select: { id: true, email: true, fullName: true },
            },
          },
        },
        purchases: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return trip;
  }

  async create(userId: string, dto: CreateTripDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.trip.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async update(tripId: string, dto: UpdateTripDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: dto,
    });
  }

  async remove(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.trip.delete({
      where: { id: tripId },
    });
  }

  async createDay(tripId: string, dto: CreateTripDayDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.tripDay.create({
      data: {
        ...dto,
        tripId,
      },
    });
  }

  async updateDay(dayId: string, dto: UpdateTripDayDto) {
    const day = await this.prisma.tripDay.findUnique({ where: { id: dayId } });
    if (!day) {
      throw new NotFoundException('Dia de viagem não encontrado');
    }

    return this.prisma.tripDay.update({
      where: { id: dayId },
      data: dto,
    });
  }

  async removeDay(dayId: string) {
    const day = await this.prisma.tripDay.findUnique({ where: { id: dayId } });
    if (!day) {
      throw new NotFoundException('Dia de viagem não encontrado');
    }

    return this.prisma.tripDay.delete({
      where: { id: dayId },
    });
  }

  async createItineraryItem(tripDayId: string, dto: CreateItineraryItemDto) {
    const day = await this.prisma.tripDay.findUnique({
      where: { id: tripDayId },
    });
    if (!day) {
      throw new NotFoundException('Dia de viagem não encontrado');
    }

    return this.prisma.itineraryItem.create({
      data: {
        ...dto,
        tripDayId,
      },
    });
  }

  async updateItineraryItem(itemId: string, dto: UpdateItineraryItemDto) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item de itinerário não encontrado');
    }

    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        isUserModified: true,
      },
    });
  }

  async removeItineraryItem(itemId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item de itinerário não encontrado');
    }

    return this.prisma.itineraryItem.delete({
      where: { id: itemId },
    });
  }

  async reorderItineraryItem(itemId: string, dto: ReorderItineraryItemDto) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item de itinerário não encontrado');
    }

    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        order: dto.order,
      },
    });
  }

  async findParticipants(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.tripParticipant.findMany({
      where: { tripId },
      include: {
        invitedBy: {
          select: { id: true, email: true, fullName: true },
        },
        acceptedBy: {
          select: { id: true, email: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteParticipant(
    tripId: string,
    dto: InviteParticipantDto,
    adminId: string,
  ) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    const existing = await this.prisma.tripParticipant.findUnique({
      where: { tripId_email: { tripId, email: dto.email } },
    });
    if (existing) {
      throw new BadRequestException('E-mail já convidado para esta viagem');
    }

    const inviteToken = randomUUID();

    return this.prisma.tripParticipant.create({
      data: {
        tripId,
        email: dto.email,
        invitedById: trip.userId, // Definido como o dono da viagem para consistência do convite
        inviteToken,
      },
    });
  }

  async removeParticipant(tripId: string, participantId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    const participant = await this.prisma.tripParticipant.findUnique({
      where: { id: participantId },
    });
    if (!participant || participant.tripId !== tripId) {
      throw new NotFoundException('Participante não encontrado nesta viagem');
    }

    return this.prisma.tripParticipant.delete({
      where: { id: participantId },
    });
  }

  async unlockPremium(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
        premiumUnlockedAt: new Date(),
      },
    });
  }

  async lockPremium(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viagem não encontrada');
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: {
        premiumUnlockedAt: null,
      },
    });
  }
}
