import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from './dto/reorder-itinerary-item.dto';
import { isTripLocked } from '../trips/trips.util';

@Injectable()
export class ItineraryService {
  constructor(private prisma: PrismaService) {}

  async findOneWithAuth(userId: string, itemId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        tripDay: {
          include: {
            trip: {
              include: { createdFromGuestJourneys: true, purchases: true },
            },
          },
        },
      },
    });

    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.tripDay.trip.userId !== userId)
      throw new ForbiddenException('Acesso negado');

    if (isTripLocked(item.tripDay.trip) && item.tripDay.dayNumber > 1) {
      throw new ForbiddenException(
        'O acesso e alteração de itens a partir do Dia 2 requer confirmação de pagamento.',
      );
    }

    return item;
  }

  async update(userId: string, itemId: string, dto: UpdateItineraryItemDto) {
    await this.findOneWithAuth(userId, itemId);
    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        isUserModified: true,
      },
    });
  }

  async remove(userId: string, itemId: string) {
    await this.findOneWithAuth(userId, itemId);
    return this.prisma.itineraryItem.delete({
      where: { id: itemId },
    });
  }

  async reorder(userId: string, itemId: string, dto: ReorderItineraryItemDto) {
    await this.findOneWithAuth(userId, itemId);
    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: { order: dto.order },
    });
  }
}
