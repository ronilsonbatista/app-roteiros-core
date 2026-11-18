import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { PlacesService, placeIconKind } from './places.service';
import { PlacesController } from './places.controller';

describe('Places autocomplete', () => {
  let service: PlacesService;
  let controller: PlacesController;
  const prisma = { baseTrip: { findMany: jest.fn() } };
  const provider = { autocompletePlaces: jest.fn() };
  const BASE = 'https://api.example/static/place-icons';

  beforeEach(async () => {
    jest.resetAllMocks();
    delete process.env.PUBLIC_BASE_URL;
    const module = await Test.createTestingModule({
      controllers: [PlacesController],
      providers: [
        PlacesService,
        { provide: PrismaService, useValue: prisma },
        { provide: GooglePlacesProvider, useValue: provider },
      ],
    }).compile();
    service = module.get(PlacesService);
    controller = module.get(PlacesController);
  });

  it('retorna vazio para q curto sem chamar o provedor', async () => {
    expect(await service.autocomplete(' r ', BASE)).toEqual({ items: [] });
    expect(provider.autocompletePlaces).not.toHaveBeenCalled();
  });

  it('usa ícone padrão por tipo quando não é destino curado', async () => {
    provider.autocompletePlaces.mockResolvedValue([
      {
        providerPlaceId: 'p1',
        name: 'Roma',
        subtitle: 'Lácio, Itália',
        types: ['locality', 'political'],
      },
      {
        providerPlaceId: 'p2',
        name: 'Itália',
        subtitle: '',
        types: ['country'],
      },
    ]);
    prisma.baseTrip.findMany.mockResolvedValue([]);

    const res = await service.autocomplete('Rom', BASE);

    expect(res.items).toEqual([
      {
        providerPlaceId: 'p1',
        name: 'Roma',
        subtitle: 'Lácio, Itália',
        iconUrl: `${BASE}/city.svg`,
      },
      {
        providerPlaceId: 'p2',
        name: 'Itália',
        subtitle: '',
        iconUrl: `${BASE}/country.svg`,
      },
    ]);
  });

  it('usa a imagem do destino curado da Home quando o providerPlaceId casa', async () => {
    provider.autocompletePlaces.mockResolvedValue([
      { providerPlaceId: 'p1', name: 'Roma', subtitle: 'Itália', types: ['locality'] },
    ]);
    prisma.baseTrip.findMany.mockResolvedValue([
      {
        providerPlaceId: 'p1',
        cardImage: 'https://cdn.example/roma/card.jpg',
        coverImage: 'https://cdn.example/roma/hero.jpg',
      },
    ]);

    const res = await service.autocomplete('Roma', BASE);

    expect(res.items[0].iconUrl).toBe('https://cdn.example/roma/card.jpg');
    expect(prisma.baseTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerPlaceId: { in: ['p1'] },
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
        }),
      }),
    );
  });

  it('controller monta a base de ícones por PUBLIC_BASE_URL ou pelo host', async () => {
    provider.autocompletePlaces.mockResolvedValue([
      { providerPlaceId: 'p1', name: 'X', subtitle: 'Y', types: [] },
    ]);
    prisma.baseTrip.findMany.mockResolvedValue([]);
    const req: any = { protocol: 'http', get: () => 'localhost:3000' };

    let res = await controller.autocomplete({ q: 'Xx' }, req);
    expect(res.items[0].iconUrl).toBe(
      'http://localhost:3000/static/place-icons/place.svg',
    );

    process.env.PUBLIC_BASE_URL = 'https://api.2go.app/';
    res = await controller.autocomplete({ q: 'Xx' }, req);
    expect(res.items[0].iconUrl).toBe(
      'https://api.2go.app/static/place-icons/place.svg',
    );
  });

  it('endpoint é público e vem antes de places/:providerPlaceId', () => {
    expect(
      Reflect.getMetadata('__guards__', PlacesController.prototype.autocomplete),
    ).toBeUndefined();
    const names = Object.getOwnPropertyNames(PlacesController.prototype);
    expect(names.indexOf('autocomplete')).toBeLessThan(
      names.indexOf('getPlaceDetails'),
    );
  });

  it.each([
    [['country', 'political'], 'country'],
    [['locality'], 'city'],
    [['administrative_area_level_1'], 'region'],
    [['natural_feature'], 'place'],
    [[], 'place'],
  ])('placeIconKind(%j) = %s', (types, kind) => {
    expect(placeIconKind(types as string[])).toBe(kind);
  });
});
