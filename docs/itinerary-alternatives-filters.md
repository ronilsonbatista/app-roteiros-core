# Paid trip — alternatives filters (`Filtrar por`)

Extends existing `GET /itinerary-items/:id/alternatives` (swap quota + candidates).

Envelope: `{ success, data, timestamp }`.

## Query params

| Param | Type | Design |
|-------|------|--------|
| `category` | `ItineraryCategory` | Categoria |
| `duration` | `UNDER_60` \| `FROM_60_TO_120` \| `OVER_120` | Duração |
| `location` | string | Localização (substring on candidate `location`) |
| `free` | boolean | Valor → Grátis |
| `paid` | boolean | Valor → Pago |
| `accessible` | boolean | Características → Acessível |
| `goodForRainyDays` | boolean | Ideal para dias de chuva |
| `goodForKids` | boolean | Bom para crianças |
| `q` | string | Search title/description |

`free` / `paid`: either alone or both. Neither → no value filter.

## `data` shape

```json
{
  "items": [
    {
      "title": "…",
      "category": "MUSEUM",
      "location": "…",
      "duration": 90,
      "cost": 0,
      "ticketStatus": "FREE",
      "accessible": true,
      "goodForKids": true,
      "goodForRainyDays": false,
      "source": "BASE_TRIP"
    }
  ],
  "facets": {
    "categories": [{ "value": "MUSEUM", "label": "Museu", "count": 2 }],
    "durations": [{ "value": "UNDER_60", "label": "Até 1 hora", "count": 1 }],
    "locations": [{ "value": "Vaticano", "label": "Vaticano", "count": 1 }]
  },
  "quota": { "allowedSwapsCount": 4, "usedSwapsCount": 1, "remainingSwaps": 3 }
}
```

Facets are computed on the **unfiltered** candidate set so the sheet can populate dropdowns.

## Storage

- `BaseAttraction.goodForKids`, `accessibility` (string → `accessible`) already existed.
- Added `BaseAttraction.goodForRainyDays` (migration `20261120190000_add_attraction_rainy_day_flag`).
- Places candidates have characteristic flags `false` (excluded when those filters are on).
