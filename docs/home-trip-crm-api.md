# Home trip CRM + tips (paid trip)

Envelope padrão: `{ "success": true, "data": ..., "timestamp": "..." }`.

Designs (PDFs/PNGs): store `media/app-home-trip-crm-2026-11-20/`.

## Product

Usuário autenticado, roteiro gerado e **pago** (`trips.premiumUnlockedAt` set):

- Home mostra intro da **próxima viagem**: destinos (backend), todos os dias (estrutura), countdown a partir de `arrivalDateTime` / `startDate`.
- **Dicas para você**: máx. **3 por destino**, servidas pelo Core (`destination_tips`).
- Geração via **Grok** a partir de pins do roteiro = job Core dedicado **depois**; hoje placeholder/seed.

Discovery Home (`GET /home/destinations`) continua para quando `trip` é `null`.

## Endpoints

### `GET /home/trip` (Bearer)

Próxima viagem paga ainda vigente/futura (`premiumUnlockedAt != null` e `endDate` null ou ≥ hoje UTC). Ordena por `startDate` asc.

```bash
curl -s "$BASE/home/trip" -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

`data`:

```json
{
  "trip": {
    "id": "…",
    "title": "Viagem para Roma & Paris",
    "destinations": [
      {
        "name": "Roma",
        "city": null,
        "country": "Itália",
        "providerPlaceId": "ChIJ…",
        "coverImageUrl": "https://…",
        "arrivalDate": "2026-07-25",
        "departureDate": "2026-07-26",
        "order": 0,
        "destinationKey": "roma"
      }
    ],
    "coverImageUrl": "https://…",
    "startDate": "2026-07-25",
    "endDate": "2026-07-28",
    "arrivalDateTime": "2026-07-25T14:00:00.000Z",
    "days": [
      {
        "id": "…",
        "dayNumber": 1,
        "date": "2026-07-25",
        "destination": "Roma",
        "title": "Chegada",
        "itemCount": 4
      }
    ],
    "premiumUnlocked": true,
    "status": "ACTIVE",
    "tips": [ /* mesmas dicas agregadas, máx 3 por destino */ ]
  }
}
```

`trip: null` → app usa Home de descoberta.

Destinos vêm de `preferences.destinations` (claim do GuestJourney) ou fallback em `trip.destination`.

### `GET /home/tips` (Bearer)

```bash
curl -s "$BASE/home/tips?destinationKey=roma&limit=3" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
# ou: ?destination=Roma
```

`data.items[]`: `{ id, destinationKey, destinationName, title, body, sortOrder, source, providerPlaceId }`.

`source`: `PLACEHOLDER` | `ITINERARY_PIN` | `GROK`.

## Storage

Tabela `destination_tips` (migration `20261120170000_add_destination_tips`):

| Campo | Nota |
|-------|------|
| `destinationKey` | slug normalizado (`roma`) |
| `destinationName` | display |
| `title` / `body` | card da Home |
| `sortOrder` | 0..2 (unique com key) |
| `source` | PLACEHOLDER / ITINERARY_PIN / GROK |
| `sourceItemId` / `sourcePlaceId` | para job Grok (pin → tip) |
| `active` | soft hide |

Seed: `SEED_DESTINATION_TIPS=false` desliga. Default upserta placeholders Roma + Paris.

## Follow-up Grok (não neste PR)

1. Job Core: para cada destino da viagem paga, ler pins (`itinerary_items` com `providerPlaceId` / atrações).
2. Chamar Grok → até 3 tips; upsert `destination_tips` com `source=GROK`, `generatedAt`, `sourceItemId`/`sourcePlaceId`.
3. Não mudar contrato App; só trocar conteúdo das rows.

## Relacionados

- Catálogo discovery: `docs/home-api.md` → `GET /home/destinations`
- Unlock pago: `billing` seta `premiumUnlockedAt` em `PAID`
- Detalhe completo do roteiro: `GET /trips/:id` (já existente)
