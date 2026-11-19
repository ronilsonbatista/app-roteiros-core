# Hotel / hospedagem Places API — fluxo Adicionar hotel

Rotas sem prefixo `/v1`. Respostas envelopadas:
`{ "success": true, "data": ..., "timestamp": "..." }`.

Provedor: Google Places API (New). Sem Place Photos (custo alto). Autocomplete
no typeahead; Details só após seleção.

## Fluxo mobile (Adicionar hospedagem)

1. Typeahead → `GET /places/hotels/autocomplete?q=`
2. Usuário escolhe um item → `GET /places/:providerPlaceId` (mapa + endereço)
3. Confirma → `POST /trips/:tripId/accommodation` com `name`, `address`,
   `latitude`, `longitude`, `providerPlaceId`
4. Manual → formulário local + mesmo `POST` sem `providerPlaceId`

## Endpoints

### `GET /places/hotels/autocomplete` (público)

- `q` (obrigatório, máx. 100; &lt; 2 chars úteis → `items: []`)
- Opcional: `lat`, `lng`, `radiusMeters` (padrão 50000, máx. 50000) — bias no destino
- Rate limit: 60/min por IP
- Items: `providerPlaceId`, `name`, `subtitle`

```bash
curl -s "$BASE/places/hotels/autocomplete?q=Ho&lat=41.9028&lng=12.4964" | jq
```

### `GET /places/hotels/search` (público)

Text Search com `includedType=lodging`. Preferir autocomplete no typeahead.
Rate limit: 30/min. Items incluem `formattedAddress` e coords.

### `GET /places/:providerPlaceId` (público)

`name`, `formattedAddress`, `latitude`, `longitude`, etc. Sem fotos.

### Persistência (já existente)

- `GET|POST|DELETE /trips/:id/accommodation` (Bearer)
- Body: ver `UpsertAccommodationDto` (`providerPlaceId` validado via Details)

## Custo / free-tier

| Momento | SKU |
|---------|-----|
| Digitação | Autocomplete (New), tipo `lodging` |
| Seleção | Place Details (campos essenciais) |
| Evitar | Place Photos; Text Search a cada keystroke |

Sem `GOOGLE_MAPS_API_KEY` → listas vazias. Falha do provedor → `502` sem expor chave.
