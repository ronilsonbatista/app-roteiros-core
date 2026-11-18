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
