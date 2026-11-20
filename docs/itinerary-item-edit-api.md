# Itinerary item edit API — delete, add, substitute

App routes (Bearer). Envelope: `{ success, data, timestamp }` via
`GlobalResponseInterceptor`. No `/v1` prefix.

Paid lock: owner (or ADMIN). Locked trips block day 2+ item mutations
(`isTripLocked` + `dayNumber > 1`).

## Existing (reuse)

| Method | Path | Role |
|--------|------|------|
| `DELETE` | `/itinerary-items/:id` | Remove pin; recalculates transits + time labels |
| `POST` | `/trip-days/:id/items` | Insert activity on a day |
| `GET` | `/itinerary-items/:id/alternatives` | Recommended swaps + quota |
| `POST` | `/itinerary-items/:id/substitute` | Replace pin; consumes swap quota |
| `PATCH` | `/itinerary-items/:id` | Update fields (e.g. duration) |
| `PATCH` | `/itinerary-items/:id/reorder` | Change `order` |
| `GET` | `/places/search?query=` | Text Search for add / substitute search |
| `GET` | `/places/autocomplete?q=` | **Localities only** (Onde) — not attraction typeahead |
| `GET` | `/places/:providerPlaceId` | Details after pick |

Swap quota on trip: `allowedSwapsCount` (default 4), `usedSwapsCount`.
Alternatives `data.quota`: `{ allowedSwapsCount, usedSwapsCount, remainingSwaps }`.

## Create item body (`POST /trip-days/:id/items`)

Required: `title`, `category`, `order`.

Optional place fields (this PR): `providerPlaceId`, `placeProvider`. When
`providerPlaceId` is present, Core validates via Place Details and may fill
`location` / coords / `googleMapsLink`. Fake ids are stripped.

Also optional: `description`, `location`, `googleMapsLink`, lat/lng,
`timeLabel`, `period`, `duration`, `cost`, `currency`, `externalLink`,
`notes`, transit fields, `ticketStatus`.

Created items set `isUserModified: true`. After create: transit + time-label
recalc for the day.

## Substitute body (`POST /itinerary-items/:id/substitute`)

Required: `title`. Optional: `providerPlaceId`, category, location, coords,
cost, duration, `ticketStatus`. Place id validated like create. Increments
`usedSwapsCount` when under quota.

## Mobile mapping

| UX | API |
|----|-----|
| Swipe / Excluir | `DELETE /itinerary-items/:id` immediately |
| Inserir nova atividade | search `GET /places/search` → pick → `POST /trip-days/:id/items` |
| Substituir (recomendações) | `GET …/alternatives` → `POST …/substitute` |
| Substituir (busca) | `GET /places/search?query=` (not locality autocomplete) → substitute |

Filtrar on Substituir is a client filter surface (separate product task);
Core alternatives / search do not take filter query params yet.

## Out of scope

- Reorganizar roteiro UI (reorder endpoint already exists)
- Grok tip generation
- Place Photos on Text Search (SKU) — thumbs from verified details / base data only
