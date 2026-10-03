import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBaseTripDto } from './dto/create-base-trip.dto';
import { UpdateBaseTripDto } from './dto/update-base-trip.dto';
import { CreateBaseTripDayDto } from './dto/create-base-trip-day.dto';
import { UpdateBaseTripDayDto } from './dto/update-base-trip-day.dto';
import { CreateBaseAttractionDto } from './dto/create-base-attraction.dto';
import { UpdateBaseAttractionDto } from './dto/update-base-attraction.dto';
import { CreateBaseRestaurantDto } from './dto/create-base-restaurant.dto';
import { UpdateBaseRestaurantDto } from './dto/update-base-restaurant.dto';

@Injectable()
export class BaseTripsService {
  constructor(private prisma: PrismaService) {}

  async createBaseTrip(adminId: string, dto: CreateBaseTripDto) {
    if (dto.status === 'PUBLISHED')
      throw new BadRequestException(
        'Crie como rascunho e revise os dias antes de publicar.',
      );
    return this.prisma.baseTrip.create({
      data: { ...dto, createdByAdminId: adminId },
    });
  }

  async findAllBaseTrips() {
    return this.prisma.baseTrip.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { days: true } },
      },
    });
  }

  async findOneBaseTrip(id: string) {
    const trip = await this.prisma.baseTrip.findUnique({
      where: { id },
      include: {
        days: {
          include: {
            attractions: { orderBy: { order: 'asc' } },
            restaurants: { orderBy: { order: 'asc' } },
          },
          orderBy: { dayNumber: 'asc' },
        },
      },
    });
    if (!trip) throw new NotFoundException('Base Trip não encontrada');
    return trip;
  }

  async updateBaseTrip(id: string, dto: UpdateBaseTripDto) {
    const trip = await this.findOneBaseTrip(id);
    if (dto.status === 'PUBLISHED') {
      const totalDays = trip.days.length;
      if (totalDays === 0) {
        throw new BadRequestException(
          'Cadastre pelo menos 1 dia com atrações ou restaurantes antes de publicar.',
        );
      }
      const hasContent = trip.days.some(
        (day) => day.attractions.length > 0 || day.restaurants.length > 0,
      );
      if (!hasContent) {
        throw new BadRequestException(
          'Cadastre pelo menos uma atração ou restaurante na biblioteca antes de publicar.',
        );
      }
    }
    return this.prisma.baseTrip.update({ where: { id }, data: dto });
  }

  async removeBaseTrip(id: string) {
    await this.findOneBaseTrip(id);
    return this.prisma.baseTrip.delete({ where: { id } });
  }

  async createBaseTripDay(baseTripId: string, dto: CreateBaseTripDayDto) {
    await this.findOneBaseTrip(baseTripId);
    return this.prisma.baseTripDay.create({
      data: { ...dto, baseTripId },
    });
  }

  async createBaseAttraction(
    baseTripDayId: string,
    dto: CreateBaseAttractionDto,
  ) {
    if (!dto.address || !dto.address.trim()) {
      throw new BadRequestException('Endereço da atração é obrigatório.');
    }
    const day = await this.prisma.baseTripDay.findUnique({
      where: { id: baseTripDayId },
    });
    if (!day) throw new NotFoundException('Base Trip Day não encontrado');
    return this.prisma.baseAttraction.create({
      data: { ...dto, baseTripDayId, address: dto.address.trim() },
    });
  }

  async updateBaseAttraction(id: string, dto: UpdateBaseAttractionDto) {
    if (dto.address !== undefined && !dto.address?.trim()) {
      throw new BadRequestException('Endereço da atração não pode ser vazio.');
    }
    const item = await this.prisma.baseAttraction.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Base Attraction não encontrada');
    return this.prisma.baseAttraction.update({
      where: { id },
      data: { ...dto, address: dto.address ? dto.address.trim() : undefined },
    });
  }

  async removeBaseAttraction(id: string) {
    const item = await this.prisma.baseAttraction.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Base Attraction não encontrada');
    return this.prisma.baseAttraction.delete({ where: { id } });
  }

  async createBaseRestaurant(
    baseTripDayId: string,
    dto: CreateBaseRestaurantDto,
  ) {
    if (!dto.address || !dto.address.trim()) {
      throw new BadRequestException('Endereço do restaurante é obrigatório.');
    }
    const day = await this.prisma.baseTripDay.findUnique({
      where: { id: baseTripDayId },
    });
    if (!day) throw new NotFoundException('Base Trip Day não encontrado');
    return this.prisma.baseRestaurant.create({
      data: { ...dto, baseTripDayId, address: dto.address.trim() },
    });
  }

  async updateBaseRestaurant(id: string, dto: UpdateBaseRestaurantDto) {
    if (dto.address !== undefined && !dto.address?.trim()) {
      throw new BadRequestException('Endereço do restaurante não pode ser vazio.');
    }
    const item = await this.prisma.baseRestaurant.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Base Restaurant não encontrado');
    return this.prisma.baseRestaurant.update({
      where: { id },
      data: { ...dto, address: dto.address ? dto.address.trim() : undefined },
    });
  }

  async removeBaseRestaurant(id: string) {
    const item = await this.prisma.baseRestaurant.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Base Restaurant não encontrado');
    return this.prisma.baseRestaurant.delete({ where: { id } });
  }

  async updateBaseTripDay(id: string, dto: UpdateBaseTripDayDto) {
    const day = await this.prisma.baseTripDay.findUnique({ where: { id } });
    if (!day) throw new NotFoundException('Base Trip Day não encontrado');
    return this.prisma.baseTripDay.update({ where: { id }, data: dto });
  }

  async removeBaseTripDay(id: string) {
    const day = await this.prisma.baseTripDay.findUnique({ where: { id } });
    if (!day) throw new NotFoundException('Base Trip Day não encontrado');
    return this.prisma.baseTripDay.delete({ where: { id } });
  }
}
