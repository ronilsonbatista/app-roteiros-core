import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserTravelProfileDto } from './dto/create-user-travel-profile.dto';
import { UpdateUserTravelProfileDto } from './dto/update-user-travel-profile.dto';

@Injectable()
export class UserTravelProfileService {
  constructor(private prisma: PrismaService) {}

  private normalizeArray(arr?: string[]): string[] | undefined {
    if (!arr) return undefined;
    const normalized = arr
      .filter(
        (item) => item && typeof item === 'string' && item.trim().length > 0,
      )
      .map((item) => item.trim());

    // Deduplicate case-insensitive but keep original case of the first occurrence
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of normalized) {
      const lower = item.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(item);
      }
    }

    return result;
  }

  private normalizeInstagram(handle?: string): string | undefined {
    if (!handle) return undefined;
    let normalized = handle.trim().toLowerCase();
    if (normalized.startsWith('@')) {
      normalized = normalized.substring(1);
    }
    return normalized;
  }

  private normalizePayload(dto: any) {
    const data = { ...dto };

    if (data.instagramHandle !== undefined) {
      data.instagramHandle = this.normalizeInstagram(data.instagramHandle);
    }

    const arrayFields = [
      'favoriteCountries',
      'favoriteCities',
      'preferredLanguages',
      'foodPreferences',
      'accessibilityNeeds',
      'travelInterests',
      'travelCompanions',
      'avoidedDestinations',
      'preferredClimate',
      'bucketListDestinations',
    ];

    for (const field of arrayFields) {
      if (data[field] !== undefined) {
        data[field] = this.normalizeArray(data[field]);
      }
    }

    return data;
  }

  async create(userId: string, dto: CreateUserTravelProfileDto) {
    const existing = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new BadRequestException(
        'O usuário já possui um perfil de viagem. Use a rota de atualização.',
      );
    }

    const normalizedData = this.normalizePayload(dto);

    return this.prisma.userTravelProfile.create({
      data: {
        ...normalizedData,
        userId,
      },
    });
  }

  async findOne(userId: string) {
    const profile = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil de viagem não encontrado');
    }

    return profile;
  }

  async update(userId: string, dto: UpdateUserTravelProfileDto) {
    const profile = await this.findOne(userId); // Verifica se existe

    const normalizedData = this.normalizePayload(dto);

    return this.prisma.userTravelProfile.update({
      where: { id: profile.id },
      data: normalizedData,
    });
  }

  async remove(userId: string) {
    const profile = await this.findOne(userId);
    return this.prisma.userTravelProfile.delete({
      where: { id: profile.id },
    });
  }

  async getAdminUserTravelProfile(userId: string) {
    return this.findOne(userId);
  }
}
