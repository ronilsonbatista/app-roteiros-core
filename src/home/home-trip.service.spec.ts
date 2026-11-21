import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HomeService } from './home.service';
import {
  expandDestinationKeyAliases,
  normalizeDestinationKey,
} from './destination-key.util';

describe('normalizeDestinationKey', () => {
  it('normaliza acentos e espaços', () => {
    expect(normalizeDestinationKey('Roma')).toBe('roma');
    expect(normalizeDestinationKey('São Paulo')).toBe('sao-paulo');
    expect(normalizeDestinationKey('Rio de Janeiro')).toBe('rio-de-janeiro');
    expect(normalizeDestinationKey('Tokyo')).toBe('tokyo');
    expect(normalizeDestinationKey('Tóquio')).toBe('toquio');
  });

  it('expande aliases Tokyo/Tóquio', () => {
    expect(expandDestinationKeyAliases('tokyo')).toEqual(
      expect.arrayContaining(['tokyo', 'toquio', 'tokio']),
    );
    expect(expandDestinationKeyAliases('toquio')).toEqual(
      expect.arrayContaining(['tokyo', 'toquio']),
    );
  });
});

describe('Home trip CRM + tips', () => {
  let service: HomeService;
  const prisma = {
    trip: { findFirst: jest.fn() },
    destinationTip: { findMany: jest.fn() },
    baseTrip: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [HomeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HomeService);
  });

  describe('getTripHome', () => {
    it('retorna trip null quando não há viagem paga vigente', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);
      await expect(service.getTripHome('user-1')).resolves.toEqual({
        trip: null,
      });
      expect(prisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            premiumUnlockedAt: { not: null },
          }),
        }),
      );
    });

    it('monta CRM com destinos, dias e dicas (máx 3 por destino)', async () => {
      prisma.trip.findFirst.mockResolvedValue({
        id: 'trip-1',
        title: 'Viagem para Roma & Paris',
        destination: 'Roma',
        coverImage: 'https://cdn.example/roma.jpg',
        startDate: new Date('2026-07-25T00:00:00.000Z'),
        endDate: new Date('2026-07-28T00:00:00.000Z'),
        arrivalDateTime: new Date('2026-07-25T14:00:00.000Z'),
        premiumUnlockedAt: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        preferences: {
          destinations: [
            {
              name: 'Roma',
              country: 'Itália',
              providerPlaceId: 'ChIJ-roma',
              arrivalDate: '2026-07-25',
              departureDate: '2026-07-26',
              order: 0,
            },
            {
              name: 'Paris',
              country: 'França',
              arrivalDate: '2026-07-27',
              departureDate: '2026-07-28',
              order: 1,
            },
          ],
        },
        days: [
          {
            id: 'day-1',
            dayNumber: 1,
            date: new Date('2026-07-25T00:00:00.000Z'),
            title: 'Chegada',
            items: [{ id: 'i1', location: 'Coliseu' }, { id: 'i2', location: null }],
          },
          {
            id: 'day-2',
            dayNumber: 2,
            date: new Date('2026-07-27T00:00:00.000Z'),
            title: 'Paris',
            items: [{ id: 'i3', location: 'Torre Eiffel' }],
          },
        ],
      });

      prisma.destinationTip.findMany.mockResolvedValue([
        {
          id: 'tip-r1',
          destinationKey: 'roma',
          destinationName: 'Roma',
          title: 'Pagamentos',
          body: 'Leve cartão e dinheiro.',
          sortOrder: 0,
          source: 'PLACEHOLDER',
          providerPlaceId: null,
        },
        {
          id: 'tip-p1',
          destinationKey: 'paris',
          destinationName: 'Paris',
          title: 'Metrô',
          body: 'Compre o Navigo.',
          sortOrder: 0,
          source: 'PLACEHOLDER',
          providerPlaceId: null,
        },
      ]);

      const res = await service.getTripHome('user-1');

      expect(res.trip).not.toBeNull();
      expect(res.trip!.id).toBe('trip-1');
      expect(res.trip!.premiumUnlocked).toBe(true);
      expect(res.trip!.destinations).toHaveLength(2);
      expect(res.trip!.destinations[0].destinationKey).toBe('roma');
      expect(res.trip!.destinations[1].name).toBe('Paris');
      expect(res.trip!.startDate).toBe('2026-07-25');
      expect(res.trip!.days).toHaveLength(2);
      expect(res.trip!.days[0].itemCount).toBe(2);
      expect(res.trip!.days[0].destination).toBe('Roma');
      expect(res.trip!.days[1].destination).toBe('Paris');
      expect(res.trip!.tips.map((t) => t.id)).toEqual(['tip-r1', 'tip-p1']);
    });
  });

  describe('listTips', () => {
    it('busca dicas Tokyo via alias toquio', async () => {
      prisma.destinationTip.findMany.mockResolvedValue([
        {
          id: 'tip-tk1',
          destinationKey: 'toquio',
          destinationName: 'Tóquio',
          title: 'IC Card',
          body: 'Suica',
          sortOrder: 0,
          source: 'PLACEHOLDER',
          providerPlaceId: null,
        },
      ]);
      const res = await service.listTips({ destination: 'Tokyo' });
      expect(res.items).toHaveLength(1);
      expect(prisma.destinationTip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            destinationKey: { in: expect.arrayContaining(['tokyo', 'toquio']) },
            active: true,
          },
        }),
      );
    });

    it('exige destinationKey ou destination', async () => {
      await expect(service.listTips({})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lista até 3 dicas por chave normalizada', async () => {
      prisma.destinationTip.findMany.mockResolvedValue([
        {
          id: 't1',
          destinationKey: 'roma',
          destinationName: 'Roma',
          title: 'A',
          body: 'a',
          sortOrder: 0,
          source: 'PLACEHOLDER',
          providerPlaceId: null,
        },
      ]);

      const res = await service.listTips({ destination: 'Roma', limit: 3 });

      expect(prisma.destinationTip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            destinationKey: { in: expect.arrayContaining(['roma', 'rome']) },
            active: true,
          },
          take: 3,
        }),
      );
      expect(res.items).toHaveLength(1);
      expect(res.items[0].title).toBe('A');
    });
  });
});
