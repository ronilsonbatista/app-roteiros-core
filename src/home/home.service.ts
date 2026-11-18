import { Injectable } from '@nestjs/common';
import { BaseTripStatus, BaseTripVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  HomeDestinationDto,
  HomeDestinationsResponseDto,
} from './dto/home-destinations.dto';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Destinos da Home, reaproveitando o catálogo BaseTrip.
   * "active" = PUBLISHED + PUBLIC, com slug, imagem, homeSortOrder e providerPlaceId definidos.
   */
  async listDestinations(limit?: number): Promise<HomeDestinationsResponseDto> {
    const rows = await this.prisma.baseTrip.findMany({
      where: {
        status: BaseTripStatus.PUBLISHED,
        visibility: BaseTripVisibility.PUBLIC,
        slug: { not: null },
        homeSortOrder: { not: null },
        providerPlaceId: { not: null },
        coverImage: { not: null },
      },
      orderBy: [{ homeSortOrder: 'asc' }, { destination: 'asc' }],
      take: limit,
      select: {
        slug: true,
        destination: true,
        country: true,
        coverImage: true,
        cardImage: true,
        homeSortOrder: true,
        providerPlaceId: true,
      },
    });

    const items: HomeDestinationDto[] = rows.map((r) => ({
      id: r.slug as string,
      name: r.destination,
      country: r.country,
      providerPlaceId: r.providerPlaceId as string,
      imageUrl: r.coverImage as string,
      ...(r.cardImage ? { cardImageUrl: r.cardImage } : {}),
      sortOrder: r.homeSortOrder as number,
      active: true,
    }));

    return { items };
  }
}
