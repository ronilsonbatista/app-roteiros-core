import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BaseTripStatus,
  BaseTripVisibility,
  DestinationTipSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  expandDestinationKeyAliases,
  normalizeDestinationKey,
} from './destination-key.util';
import {
  HomeDestinationDto,
  HomeDestinationsResponseDto,
} from './dto/home-destinations.dto';
import {
  HomeTipDto,
  HomeTipsResponseDto,
} from './dto/home-tips.dto';
import {
  HomeTripCrmDto,
  HomeTripDayDto,
  HomeTripDestinationDto,
  HomeTripResponseDto,
} from './dto/home-trip.dto';

const TIPS_PER_DESTINATION_MAX = 3;

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

  /**
   * Paid-trip Home CRM: next unlocked upcoming/ongoing trip for the user.
   * Null trip → app keeps discovery Home (GET /home/destinations).
   */
  async getTripHome(userId: string): Promise<HomeTripResponseDto> {
    const startOfToday = utcStartOfToday();

    const trip = await this.prisma.trip.findFirst({
      where: {
        userId,
        premiumUnlockedAt: { not: null },
        OR: [{ endDate: null }, { endDate: { gte: startOfToday } }],
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: {
            items: {
              select: { id: true, location: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!trip) {
      return { trip: null };
    }

    const destinations = await this.resolveDestinations(trip);
    const days: HomeTripDayDto[] = trip.days.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date ? toDateOnly(day.date) : null,
      destination: resolveDayDestination(day, destinations, trip.destination),
      title: day.title,
      itemCount: day.items.length,
    }));

    const tips = await this.listTipsForDestinations(
      destinations.map((d) => d.destinationKey),
    );

    const coverFromDest =
      destinations.find((d) => d.coverImageUrl)?.coverImageUrl ?? null;

    const crm: HomeTripCrmDto = {
      id: trip.id,
      title: trip.title,
      destinations,
      // Prefer trip cover; else first destination cover (BaseTrip / prefs).
      coverImageUrl: trip.coverImage ?? coverFromDest,
      startDate: trip.startDate ? toDateOnly(trip.startDate) : null,
      endDate: trip.endDate ? toDateOnly(trip.endDate) : null,
      arrivalDateTime: trip.arrivalDateTime
        ? trip.arrivalDateTime.toISOString()
        : null,
      days,
      premiumUnlocked: true,
      status: trip.status,
      tips,
    };

    return { trip: crm };
  }

  /**
   * Tips by destination (max 3). Core owns storage; Grok fill is a later job.
   */
  async listTips(params: {
    destinationKey?: string;
    destination?: string;
    limit?: number;
  }): Promise<HomeTipsResponseDto> {
    const key =
      params.destinationKey?.trim() ||
      (params.destination
        ? normalizeDestinationKey(params.destination)
        : '');
    if (!key) {
      throw new BadRequestException(
        'Informe destinationKey ou destination para listar dicas.',
      );
    }

    const limit = Math.min(
      Math.max(params.limit ?? TIPS_PER_DESTINATION_MAX, 1),
      TIPS_PER_DESTINATION_MAX,
    );

    const keys = expandDestinationKeyAliases(key);
    const rows = await this.prisma.destinationTip.findMany({
      where: { destinationKey: { in: keys }, active: true },
      orderBy: { sortOrder: 'asc' },
      take: limit,
    });

    return { items: rows.map(mapTip) };
  }

  private async listTipsForDestinations(
    destinationKeys: string[],
  ): Promise<HomeTipDto[]> {
    const unique = [...new Set(destinationKeys.filter(Boolean))];
    if (unique.length === 0) return [];

    const lookupKeys = [
      ...new Set(unique.flatMap((k) => expandDestinationKeyAliases(k))),
    ];

    const rows = await this.prisma.destinationTip.findMany({
      where: { destinationKey: { in: lookupKeys }, active: true },
      orderBy: [{ destinationKey: 'asc' }, { sortOrder: 'asc' }],
    });

    const byKey = new Map<string, typeof rows>();
    for (const row of rows) {
      for (const alias of expandDestinationKeyAliases(row.destinationKey)) {
        const list = byKey.get(alias) ?? [];
        if (
          list.length < TIPS_PER_DESTINATION_MAX &&
          !list.some((t) => t.id === row.id)
        ) {
          list.push(row);
          byKey.set(alias, list);
        }
      }
    }

    const ordered: HomeTipDto[] = [];
    const seenTipIds = new Set<string>();
    for (const key of unique) {
      for (const row of byKey.get(key) ?? []) {
        if (seenTipIds.has(row.id)) continue;
        seenTipIds.add(row.id);
        ordered.push(mapTip(row));
      }
    }
    return ordered;
  }

  private async resolveDestinations(trip: {
    destination: string;
    coverImage: string | null;
    preferences: unknown;
  }): Promise<HomeTripDestinationDto[]> {
    const prefs = (trip.preferences ?? {}) as {
      destinations?: Array<Record<string, unknown>>;
    };
    const fromPrefs = Array.isArray(prefs.destinations)
      ? prefs.destinations
      : [];

    if (fromPrefs.length > 0) {
      const mapped: HomeTripDestinationDto[] = [];
      for (const [index, d] of fromPrefs.entries()) {
        const name =
          typeof d.name === 'string' && d.name.trim()
            ? d.name.trim()
            : trip.destination;
        const key = normalizeDestinationKey(name);
        let coverImageUrl =
          typeof d.coverImage === 'string' ? d.coverImage : null;
        if (!coverImageUrl && index === 0) {
          coverImageUrl = trip.coverImage;
        }
        if (!coverImageUrl) {
          coverImageUrl = await this.lookupCover(name);
        }
        mapped.push({
          name,
          city: typeof d.city === 'string' ? d.city : null,
          country: typeof d.country === 'string' ? d.country : null,
          providerPlaceId:
            typeof d.providerPlaceId === 'string'
              ? d.providerPlaceId
              : typeof d.placeId === 'string'
                ? d.placeId
                : null,
          coverImageUrl,
          arrivalDate:
            typeof d.arrivalDate === 'string' ? d.arrivalDate : null,
          departureDate:
            typeof d.departureDate === 'string' ? d.departureDate : null,
          order: typeof d.order === 'number' ? d.order : index,
          destinationKey: key,
        });
      }
      return mapped;
    }

    const key = normalizeDestinationKey(trip.destination);
    return [
      {
        name: trip.destination,
        city: null,
        country: null,
        providerPlaceId: null,
        coverImageUrl: trip.coverImage ?? (await this.lookupCover(trip.destination)),
        arrivalDate: null,
        departureDate: null,
        order: 0,
        destinationKey: key,
      },
    ];
  }

  private async lookupCover(destinationName: string): Promise<string | null> {
    const key = normalizeDestinationKey(destinationName);
    const aliases = expandDestinationKeyAliases(key);
    const candidates = [
      destinationName,
      ...aliases.map((a) => a.replace(/-/g, ' ')),
    ];

    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
      const match = await this.prisma.baseTrip.findFirst({
        where: {
          destination: { contains: candidate, mode: 'insensitive' },
          coverImage: { not: null },
        },
        select: { coverImage: true },
        orderBy: { homeSortOrder: 'asc' },
      });
      if (match?.coverImage) return match.coverImage;
    }

    // Slug match for catalog BaseTrips (e.g. toquio).
    const bySlug = await this.prisma.baseTrip.findFirst({
      where: {
        slug: { in: aliases },
        coverImage: { not: null },
      },
      select: { coverImage: true },
      orderBy: { homeSortOrder: 'asc' },
    });
    return bySlug?.coverImage ?? null;
  }
}

function mapTip(row: {
  id: string;
  destinationKey: string;
  destinationName: string;
  title: string;
  body: string;
  sortOrder: number;
  source: DestinationTipSource;
  providerPlaceId: string | null;
}): HomeTipDto {
  return {
    id: row.id,
    destinationKey: row.destinationKey,
    destinationName: row.destinationName,
    title: row.title,
    body: row.body,
    sortOrder: row.sortOrder,
    source: row.source,
    providerPlaceId: row.providerPlaceId,
  };
}

function utcStartOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveDayDestination(
  day: {
    date: Date | null;
    title: string | null;
    items: Array<{ location: string | null }>;
  },
  destinations: HomeTripDestinationDto[],
  fallback: string,
): string | null {
  if (day.date && destinations.length > 0) {
    const dayIso = toDateOnly(day.date);
    const match = destinations.find((dest) => {
      if (!dest.arrivalDate) return false;
      const end = dest.departureDate ?? dest.arrivalDate;
      return dayIso >= dest.arrivalDate && dayIso <= end;
    });
    if (match) return match.name;
  }

  const loc = day.items.find((i) => i.location)?.location;
  if (loc) return loc;

  if (destinations.length === 1) return destinations[0].name;
  return destinations[0]?.name ?? fallback ?? null;
}
