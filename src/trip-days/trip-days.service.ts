import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTripDayDto } from './dto/update-trip-day.dto';
import { CreateItineraryItemDto } from '../itinerary/dto/create-itinerary-item.dto';

@Injectable()
export class TripDaysService {
  constructor(private prisma: PrismaService) {}

  async findOneWithAuth(userId: string, dayId: string) {
    const tripDay = await this.prisma.tripDay.findUnique({
      where: { id: dayId },
      include: { trip: true },
    });

    if (!tripDay) throw new NotFoundException('Dia não encontrado');
    if (tripDay.trip.userId !== userId) throw new ForbiddenException('Acesso negado');

    return tripDay;
  }

  async update(userId: string, dayId: string, dto: UpdateTripDayDto) {
    await this.findOneWithAuth(userId, dayId);
    return this.prisma.tripDay.update({
      where: { id: dayId },
      data: dto,
    });
  }

  async remove(userId: string, dayId: string) {
    await this.findOneWithAuth(userId, dayId);
    return this.prisma.tripDay.delete({
      where: { id: dayId },
    });
  }

  async createItem(userId: string, dayId: string, dto: CreateItineraryItemDto) {
    await this.findOneWithAuth(userId, dayId);
    return this.prisma.itineraryItem.create({
      data: {
        ...dto,
        tripDayId: dayId,
      },
    });
  }
}
