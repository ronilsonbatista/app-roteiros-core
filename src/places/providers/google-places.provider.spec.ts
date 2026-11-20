import { of, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { GooglePlacesProvider } from './google-places.provider';
import {
  priceLevelToDisplay,
  priceLevelToNumeric,
} from './places-provider.interface';

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

describe('GooglePlacesProvider.getPlaceDetails (Detalhes enrichment)', () => {
  const http = { post: jest.fn(), get: jest.fn() };
  const make = () => new GooglePlacesProvider(http as any);

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('mapeia hours, reviews, editorial e resolve photoUri', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    http.get
      .mockReturnValueOnce(
        of({
          data: {
            id: 'places/ChIJ-coliseu',
            displayName: { text: 'Coliseu' },
            formattedAddress: 'Piazza del Colosseo, 1',
            location: { latitude: 41.89, longitude: 12.49 },
            rating: 4.8,
            userRatingCount: 1000,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            types: ['tourist_attraction'],
            primaryType: 'tourist_attraction',
            primaryTypeDisplayName: { text: 'Ponto turístico' },
            currentOpeningHours: {
              periods: [
                {
                  open: { hour: 9, minute: 0 },
                  close: { hour: 19, minute: 0 },
                },
              ],
            },
            editorialSummary: { text: 'Símbolo de Roma.' },
            photos: [{ name: 'places/ChIJ-coliseu/photos/abc', widthPx: 800 }],
            reviews: [
              {
                rating: 5,
                text: { text: 'Incrível' },
                authorAttribution: {
                  displayName: 'Ana',
                  photoUri: 'https://example.com/a.jpg',
                },
              },
            ],
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: { photoUri: 'https://lh3.googleusercontent.com/resolved' },
        }),
      );

    const details = await make().getPlaceDetails('ChIJ-coliseu');

    expect(details).toEqual(
      expect.objectContaining({
        name: 'Coliseu',
        userRatingsTotal: 1000,
        priceLevelDisplay: '$$',
        openingHoursText: '09:00-19:00',
        editorialSummary: 'Símbolo de Roma.',
        primaryTypeDisplayName: 'Ponto turístico',
        photos: [
          expect.objectContaining({
            name: 'places/ChIJ-coliseu/photos/abc',
            photoUri: 'https://lh3.googleusercontent.com/resolved',
          }),
        ],
        reviews: [
          expect.objectContaining({
            rating: 5,
            text: 'Incrível',
            authorName: 'Ana',
          }),
        ],
      }),
    );

    const fieldMask = http.get.mock.calls[0][1].headers['X-Goog-FieldMask'];
    expect(fieldMask).toContain('userRatingCount');
    expect(fieldMask).toContain('regularOpeningHours');
    expect(fieldMask).toContain('photos');
    expect(fieldMask).toContain('reviews');
  });
});

describe('priceLevelToDisplay', () => {
  it('converte enum e inteiro', () => {
    expect(priceLevelToDisplay('PRICE_LEVEL_MODERATE')).toBe('$$');
    expect(priceLevelToDisplay(3)).toBe('$$$');
    expect(priceLevelToDisplay(undefined)).toBeUndefined();
  });
});

describe('priceLevelToNumeric', () => {
  it('converte enum e inteiro para escala 0–4', () => {
    expect(priceLevelToNumeric('PRICE_LEVEL_MODERATE')).toBe(2);
    expect(priceLevelToNumeric(3)).toBe(3);
    expect(priceLevelToNumeric(undefined)).toBeUndefined();
    expect(priceLevelToNumeric('PRICE_LEVEL_FREE')).toBe(0);
  });
});
