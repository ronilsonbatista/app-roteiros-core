import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

describe('Home destinations', () => {
  let service: HomeService;
  let controller: HomeController;
  const prisma = { baseTrip: { findMany: jest.fn() } };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [HomeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(HomeService);
    controller = module.get(HomeController);
  });

  it('filtra ativos (PUBLISHED/PUBLIC, com slug/imagem/ordem/providerPlaceId) e ordena por sortOrder', async () => {
    prisma.baseTrip.findMany.mockResolvedValue([]);

    await service.listDestinations(5);

    expect(prisma.baseTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          slug: { not: null },
          homeSortOrder: { not: null },
          providerPlaceId: { not: null },
          coverImage: { not: null },
        },
        orderBy: [{ homeSortOrder: 'asc' }, { destination: 'asc' }],
        take: 5,
      }),
    );
  });

  it('mapeia o contrato e omite cardImageUrl quando ausente', async () => {
    prisma.baseTrip.findMany.mockResolvedValue([
      {
        slug: 'capadocia',
        destination: 'Capadócia',
        country: 'Turquia',
        providerPlaceId: 'ChIJ-capadocia',
        coverImage: 'https://cdn.example/c/hero.jpg',
        cardImage: 'https://cdn.example/c/card.jpg',
        homeSortOrder: 0,
      },
      {
        slug: 'rio-de-janeiro',
        destination: 'Rio de Janeiro',
        country: 'Brasil',
        providerPlaceId: 'ChIJ-rio',
        coverImage: 'https://cdn.example/r/hero.jpg',
        cardImage: null,
        homeSortOrder: 1,
      },
    ]);

    const res = await controller.listDestinations({});

    expect(res.items[0]).toEqual({
      id: 'capadocia',
      name: 'Capadócia',
      country: 'Turquia',
      providerPlaceId: 'ChIJ-capadocia',
      imageUrl: 'https://cdn.example/c/hero.jpg',
      cardImageUrl: 'https://cdn.example/c/card.jpg',
      sortOrder: 0,
      active: true,
    });
    expect(res.items[1]).not.toHaveProperty('cardImageUrl');
    expect(res.items[1].providerPlaceId).toBe('ChIJ-rio');
    expect(res.items[1].active).toBe(true);
  });

  it('endpoint declara Cache-Control public, max-age=300', () => {
    const headers = Reflect.getMetadata(
      '__headers__',
      HomeController.prototype.listDestinations,
    );
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'public, max-age=300',
    });
  });

  it('endpoint é público (sem guards)', () => {
    expect(
      Reflect.getMetadata('__guards__', HomeController.prototype.listDestinations),
    ).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', HomeController)).toBeUndefined();
  });
});
