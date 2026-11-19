import { of, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { GooglePlacesProvider } from './google-places.provider';

describe('GooglePlacesProvider.autocompletePlaces', () => {
  const http = { post: jest.fn() };
  const make = () => new GooglePlacesProvider(http as any);

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('retorna vazio sem chave configurada', async () => {
    expect(await make().autocompletePlaces('Roma')).toEqual([]);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('mapeia suggestions e restringe a localidades', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    http.post.mockReturnValue(
      of({
        data: {
          suggestions: [
            {
              placePrediction: {
                placeId: 'ChIJ-roma',
                text: { text: 'Roma, Metropolitan City of Rome, Itália' },
                structuredFormat: {
                  mainText: { text: 'Roma' },
                  secondaryText: { text: 'Lácio, Itália' },
                },
                types: ['locality', 'political'],
              },
            },
            { queryPrediction: { text: { text: 'ignorado' } } },
          ],
        },
      }),
    );

    const res = await make().autocompletePlaces('Rom');

    expect(res).toEqual([
      {
        providerPlaceId: 'ChIJ-roma',
        name: 'Roma',
        subtitle: 'Lácio, Itália',
        types: ['locality', 'political'],
      },
    ]);
    const [url, body] = http.post.mock.calls[0];
    expect(url).toContain(':autocomplete');
    expect(body.includedPrimaryTypes).toContain('locality');
  });

  it('autocompleteHotels restringe a lodging e aplica locationBias', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    http.post.mockReturnValue(
      of({
        data: {
          suggestions: [
            {
              placePrediction: {
                placeId: 'ChIJ-hotel',
                structuredFormat: {
                  mainText: { text: 'Hotel Diana Roof Garden' },
                  secondaryText: { text: 'Roma, Itália' },
                },
                types: ['lodging', 'hotel'],
              },
            },
          ],
        },
      }),
    );

    const res = await make().autocompleteHotels('Ho', {
      latitude: 41.9,
      longitude: 12.5,
      radiusMeters: 25000,
    });

    expect(res[0].name).toBe('Hotel Diana Roof Garden');
    const [, body] = http.post.mock.calls[0];
    expect(body.includedPrimaryTypes).toEqual(['lodging']);
    expect(body.locationBias).toEqual({
      circle: {
        center: { latitude: 41.9, longitude: 12.5 },
        radius: 25000,
      },
    });
  });

  it('searchPlaces aceita includedType lodging', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    http.post.mockReturnValue(
      of({
        data: {
          places: [
            {
              id: 'ChIJ-1',
              displayName: { text: 'Gioberti Hotel' },
              formattedAddress: 'Via Gioberti, Roma',
              location: { latitude: 41.9, longitude: 12.5 },
              types: ['lodging'],
            },
          ],
        },
      }),
    );

    const res = await make().searchPlaces('Gioberti', {
      includedType: 'lodging',
      locationBias: { latitude: 41.9, longitude: 12.5 },
    });

    expect(res[0].providerPlaceId).toBe('ChIJ-1');
    const [, body] = http.post.mock.calls[0];
    expect(body.includedType).toBe('lodging');
    expect(body.locationBias.circle.radius).toBe(50000);
  });

  it('erro do provedor vira 502 sem vazar a chave', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'secret-key-123';
    http.post.mockReturnValue(throwError(() => new Error('boom secret-key-123')));

    await expect(make().autocompletePlaces('Rom')).rejects.toBeInstanceOf(
      HttpException,
    );
    await make()
      .autocompletePlaces('Rom')
      .catch((e: HttpException) => {
        expect(JSON.stringify(e.getResponse())).not.toContain('secret-key-123');
      });
  });
});
