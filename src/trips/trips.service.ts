import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CreateTripDayDto } from '../trip-days/dto/create-trip-day.dto';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTripDto) {
    return this.prisma.trip.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.trip.findMany({
      where: { userId },
      include: { days: true },
    });
  }

  async findOne(userId: string, tripId: string, allowViewer: boolean = false) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: { include: { items: true } },
        participants: true,
      },
    });

    if (!trip) throw new NotFoundException('Viagem não encontrada');

    const isOwner = trip.userId === userId;
    let isViewer = false;

    if (!isOwner && allowViewer) {
      const participant = trip.participants.find(
        (p) => p.acceptedById === userId && p.accepted === true,
      );
      if (participant) {
        isViewer = true;
      }
    }

    if (!isOwner && !isViewer) {
      throw new ForbiddenException('Acesso negado');
    }

    // Removendo array de participants da resposta caso não queiramos expor sempre
    const { participants, ...tripData } = trip;
    return tripData;
  }

  async update(userId: string, tripId: string, dto: UpdateTripDto) {
    await this.findOne(userId, tripId, false); // verifica se existe e pertence ao user (apenas owner)
    return this.prisma.trip.update({
      where: { id: tripId },
      data: dto,
    });
  }

  async remove(userId: string, tripId: string) {
    await this.findOne(userId, tripId, false); // apenas owner
    return this.prisma.trip.delete({
      where: { id: tripId },
    });
  }

  async createDay(userId: string, tripId: string, dto: CreateTripDayDto) {
    await this.findOne(userId, tripId, false); // apenas owner
    return this.prisma.tripDay.create({
      data: {
        ...dto,
        tripId,
      },
    });
  }
}
