import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ReorderItineraryItemDto } from './dto/reorder-itinerary-item.dto';

@Injectable()
export class ItineraryService {
  constructor(private prisma: PrismaService) {}

  async findOneWithAuth(userId: string, itemId: string) {
    const item = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: { tripDay: { include: { trip: true } } },
    });

    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.tripDay.trip.userId !== userId) throw new ForbiddenException('Acesso negado');

    return item;
  }

  async update(userId: string, itemId: string, dto: UpdateItineraryItemDto) {
    await this.findOneWithAuth(userId, itemId);
    return this.prisma.itineraryItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        isUserModified: true, // Regra solicitada: marcar isUserModified = true ao editar manualmente
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
