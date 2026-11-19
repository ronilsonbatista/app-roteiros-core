import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlacesProvider } from './providers/google-places.provider';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';

describe('Places hotels search/autocomplete', () => {
  let service: PlacesService;
  let controller: PlacesController;
  const prisma = { baseTrip: { findMany: jest.fn() } };
  const provider = {
    autocompletePlaces: jest.fn(),
    autocompleteHotels: jest.fn(),
    searchPlaces: jest.fn(),
    getPlaceDetails: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
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

  it('autocompleteHotels retorna vazio para q curto sem chamar o provedor', async () => {
    expect(await service.autocompleteHotels(' H ')).toEqual({ items: [] });
    expect(provider.autocompleteHotels).not.toHaveBeenCalled();
  });

  it('autocompleteHotels mapeia name/subtitle/providerPlaceId', async () => {
    provider.autocompleteHotels.mockResolvedValue([
      {
        providerPlaceId: 'ChIJ-hotel',
        name: 'Hotel Diana Roof Garden',
        subtitle: 'Roma, Itália',
        types: ['lodging', 'hotel'],
      },
    ]);

    const res = await service.autocompleteHotels('Ho', {
      lat: 41.9,
      lng: 12.5,
      radiusMeters: 30000,
    });

    expect(res.items).toEqual([
      {
        providerPlaceId: 'ChIJ-hotel',
        name: 'Hotel Diana Roof Garden',
        subtitle: 'Roma, Itália',
      },
    ]);
    expect(provider.autocompleteHotels).toHaveBeenCalledWith('Ho', {
      latitude: 41.9,
      longitude: 12.5,
      radiusMeters: 30000,
    });
  });

  it('searchHotels usa includedType lodging e envelopa items', async () => {
    provider.searchPlaces.mockResolvedValue([
      {
        provider: 'GOOGLE',
        providerPlaceId: 'ChIJ-1',
        name: 'The Hoxton Rome',
        formattedAddress: 'Largo Benedetto Marcello, 220, Roma',
        latitude: 41.91,
        longitude: 12.49,
        rating: 4.6,
        types: ['lodging'],
      },
    ]);

    const res = await service.searchHotels('Hoxton', {
      lat: 41.9,
      lng: 12.5,
    });

    expect(res.items[0]).toMatchObject({
      providerPlaceId: 'ChIJ-1',
      name: 'The Hoxton Rome',
      formattedAddress: 'Largo Benedetto Marcello, 220, Roma',
      latitude: 41.91,
      longitude: 12.49,
    });
    expect(provider.searchPlaces).toHaveBeenCalledWith('Hoxton', {
      includedType: 'lodging',
      locationBias: {
        latitude: 41.9,
        longitude: 12.5,
        radiusMeters: undefined,
      },
    });
  });

  it('controller hotels endpoints são públicos e antes de :providerPlaceId', () => {
    expect(
      Reflect.getMetadata(
        '__guards__',
        PlacesController.prototype.autocompleteHotels,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('__guards__', PlacesController.prototype.searchHotels),
    ).toBeUndefined();
    const names = Object.getOwnPropertyNames(PlacesController.prototype);
    expect(names.indexOf('autocompleteHotels')).toBeLessThan(
      names.indexOf('getPlaceDetails'),
    );
    expect(names.indexOf('searchHotels')).toBeLessThan(
      names.indexOf('getPlaceDetails'),
    );
  });

  it('controller repassa query lat/lng para o service', async () => {
    provider.autocompleteHotels.mockResolvedValue([]);
    await controller.autocompleteHotels({
      q: 'Hotel',
      lat: 41.9,
      lng: 12.5,
      radiusMeters: 40000,
    });
    expect(provider.autocompleteHotels).toHaveBeenCalledWith('Hotel', {
      latitude: 41.9,
      longitude: 12.5,
      radiusMeters: 40000,
    });
  });
});
