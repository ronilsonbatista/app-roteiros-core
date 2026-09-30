import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { UpsertAccommodationDto } from './dto/upsert-accommodation.dto';
import { CreateTripDayDto } from '../trip-days/dto/create-trip-day.dto';
import { isTripLocked } from './trips.util';
import { Role } from '@prisma/client';
import { recalculateDayTransits } from './itinerary-schedule.util';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private placesService: PlacesService,
  ) {}

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
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { items: { orderBy: { order: 'asc' } } },
        },
        accommodation: true,
        participants: true,
        createdFromGuestJourneys: true,
        purchases: true,
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

    // Check if this trip is a paid product trip subject to entitlement gating
    const isLocked = isTripLocked(trip);

    // Remove internal relations before returning
    const { participants, createdFromGuestJourneys, purchases, ...tripData } =
      trip;

    if (isLocked) {
      // Server-side gating: Only Day 1 items are returned for preview. Days 2+ items are stripped.
      const gatedDays = tripData.days.map((day, idx) => {
        if (day.dayNumber === 1 || idx === 0) {
          return day;
        }
        return {
          ...day,
          items: [], // Strip items for locked days
        };
      });
      return {
        ...tripData,
        days: gatedDays,
      };
    }

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

  async getAccommodation(user: any, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { accommodation: true },
    });
    if (!trip) throw new NotFoundException('Viagem não encontrada');

    const isOwner = trip.userId === user.userId;
    const isAdmin = user.role === 'ADMIN' || user.role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Acesso negado');
    }

    return trip.accommodation;
  }

  async upsertAccommodation(
    user: any,
    tripId: string,
    dto: UpsertAccommodationDto,
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { accommodation: true },
    });
    if (!trip) throw new NotFoundException('Viagem não encontrada');

    const isOwner = trip.userId === user.userId;
    const isAdmin = user.role === 'ADMIN' || user.role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Acesso negado');
    }

    // Validate providerPlaceId if provided (strip fake place ID)
    let validatedPlaceId = dto.providerPlaceId || null;
    let latitude = dto.latitude ?? null;
    let longitude = dto.longitude ?? null;
    let address = dto.address ?? null;

    if (validatedPlaceId) {
      try {
        const details =
          await this.placesService.getPlaceDetails(validatedPlaceId);
        if (details) {
          validatedPlaceId = details.providerPlaceId || validatedPlaceId;
          if (details.latitude != null && details.longitude != null) {
            latitude = details.latitude;
            longitude = details.longitude;
          }
          if (details.formattedAddress && !address) {
            address = details.formattedAddress;
          }
        } else {
          validatedPlaceId = null;
        }
      } catch {
        // Strip fake / non-existent place ID
        validatedPlaceId = null;
      }
    }

    const accommodation = await this.prisma.tripAccommodation.upsert({
      where: { tripId },
      create: {
        tripId,
        name: dto.name,
        address,
        neighborhood: dto.neighborhood,
        zipCode: dto.zipCode,
        latitude,
        longitude,
        providerPlaceId: validatedPlaceId,
        checkInDateTime: dto.checkInDateTime
          ? new Date(dto.checkInDateTime)
          : null,
        checkOutDateTime: dto.checkOutDateTime
          ? new Date(dto.checkOutDateTime)
          : null,
        checkInDate: dto.checkInDate ? new Date(dto.checkInDate) : null,
        checkInTime: dto.checkInTime,
        checkOutDate: dto.checkOutDate ? new Date(dto.checkOutDate) : null,
        checkOutTime: dto.checkOutTime,
      },
      update: {
        name: dto.name,
        address,
        neighborhood: dto.neighborhood,
        zipCode: dto.zipCode,
        latitude,
        longitude,
        providerPlaceId: validatedPlaceId,
        checkInDateTime: dto.checkInDateTime
          ? new Date(dto.checkInDateTime)
          : null,
        checkOutDateTime: dto.checkOutDateTime
          ? new Date(dto.checkOutDateTime)
          : null,
        checkInDate: dto.checkInDate ? new Date(dto.checkInDate) : null,
        checkInTime: dto.checkInTime,
        checkOutDate: dto.checkOutDate ? new Date(dto.checkOutDate) : null,
        checkOutTime: dto.checkOutTime,
      },
    });

    // Recalculate transit for Day 1
    const day1 = await this.prisma.tripDay.findFirst({
      where: { tripId, dayNumber: 1 },
    });
    if (day1) {
      await recalculateDayTransits(day1.id, this.prisma);
    }

    return accommodation;
  }

  async removeAccommodation(user: any, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { accommodation: true },
    });
    if (!trip) throw new NotFoundException('Viagem não encontrada');

    const isOwner = trip.userId === user.userId;
    const isAdmin = user.role === 'ADMIN' || user.role === Role.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Acesso negado');
    }

    await this.prisma.tripAccommodation.deleteMany({
      where: { tripId },
    });

    const day1 = await this.prisma.tripDay.findFirst({
      where: { tripId, dayNumber: 1 },
    });
    if (day1) {
      await recalculateDayTransits(day1.id, this.prisma);
    }

    return { message: 'Hospedagem removida com sucesso' };
  }
}
