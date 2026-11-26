# Home API — destinos e foto do usuário

Rotas seguem o padrão atual do Core (sem prefixo `/v1`). Todas as respostas são
envelopadas pelo `GlobalResponseInterceptor`: `{ "success": true, "data": ..., "timestamp": "..." }`.

## 1. `GET /home/destinations` (público, auth opcional)

- Reaproveita o catálogo `BaseTrip`. "Ativo" = `status=PUBLISHED`, `visibility=PUBLIC`,
  com `slug`, `coverImage`, `homeSortOrder` e `providerPlaceId` definidos. Ordenado por `homeSortOrder` asc.
- Mapeamento: `id`=slug, `name`=destination, `country`, `providerPlaceId` (obrigatório; itens sem ele não são listados), `imageUrl`=coverImage,
  `cardImageUrl`=cardImage (omitido se vazio), `sortOrder`=homeSortOrder, `active`=true.
- Query opcional: `limit` (1–50).
- Header: `Cache-Control: public, max-age=300`.
- Token Bearer, se enviado, é ignorado (sem personalização na v1).

```bash
BASE=https://<staging-host>

curl -i "$BASE/home/destinations"
curl -i "$BASE/home/destinations?limit=3"
```

Resposta (resumo):

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "capadocia",
        "name": "Capadócia",
        "country": "Turquia",
        "providerPlaceId": "ChIJ…",
        "imageUrl": "https://2go-travel-web-app.vercel.app/images/destinations/capadocia/curated-hero.jpg",
        "cardImageUrl": "https://2go-travel-web-app.vercel.app/images/destinations/capadocia/curated-guide-card.jpg",
        "sortOrder": 0,
        "active": true
      }
    ]
  },
  "timestamp": "2026-11-18T12:00:00.000Z"
}
```

Seed: `npm run seed` (10 destinos, upsert por slug; desligar com `SEED_HOME_DESTINATIONS=false`).
Imagens: CDN do site (`HOME_DESTINATION_IMAGE_BASE_URL`, default `https://2go-travel-web-app.vercel.app`) —
`/images/destinations/{slug}/curated-hero.jpg` e `curated-guide-card.jpg`. **Não** hotlink Wikimedia
(HTTP 429 no simulador iOS). Staging já semeado: `npm run update:home-images` no shell do
`core-api` (ou `scripts/update-home-destination-images.sql`). Cache da rota: 300s.
Migration: `20261118120000_add_home_destinations_fields` (colunas nulas: `slug`, `cardImage`, `homeSortOrder`).

## 2. `GET /users/me` (Bearer)

Formato anterior mantido; `user` ganhou `id`, `displayName` (fullName) e `photoUrl` (`null` sem foto).

```bash
curl -s "$BASE/users/me" -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "data": {
    "message": "Acesso liberado!",
    "user": {
      "userId": "…", "id": "…", "email": "user@example.com", "role": "USER",
      "displayName": "Gustavo Vieira",
      "photoUrl": null
    }
  },
  "timestamp": "…"
}
```

Testar URL válida em staging: defina `photoUrl` do usuário no banco
(`UPDATE users SET "photoUrl"='https://…/avatar.jpg' WHERE email='…';`), e `NULL` para o caso sem foto.

## 3. `providerPlaceId` nos destinos

- É o `place.id` do Google Places (Places API v1), o mesmo retornado por `GET /places/search`
  e aceito por `GET /places/:providerPlaceId`. Armazenado em `base_trips.providerPlaceId`
  (migration `20261118170000_add_base_trip_provider_place_id`).
- O seed resolve o ID por Text Search (`"<nome>, <país>"`, `pt-BR`, só `places.id`) e usa
  `GOOGLE_MAPS_API_KEY` do ambiente (nunca logada). IDs já gravados são preservados.
  Sem a chave, o destino é gravado sem ID e **não aparece** na Home até o seed rodar de novo com a chave.
- O seed imprime `nome -> id (displayName)` para revisão; ajuste manualmente no banco se o Google
  devolver um resultado inadequado (ex.: região em vez de cidade).

```bash
# staging: com a chave configurada
npm run seed
curl -s "$BASE/home/destinations" | jq '.data.items[] | {id, providerPlaceId}'
curl -s "$BASE/places/<providerPlaceId>"   # confere que o ID resolve
```

## 4. `GET /places/autocomplete?q=` (público, guest + auth)

- Autocomplete de localidades para o passo Onde. Restrito a cidade (`locality`), regiões
  (`administrative_area_level_1/2`) e países; idioma `pt-BR`. Sem `/v1`; envelope padrão.
- `q`: obrigatório, máx. 100; com menos de 2 caracteres úteis retorna `items: []` sem consultar o provedor.
- Rate limit: 60 req/min por IP (`@Throttle`). Debounce de ~300ms no app é suficiente.
- Sem `GOOGLE_MAPS_API_KEY`, retorna `items: []`. Falha do provedor → `502` sem expor chave.
- Cada item: `providerPlaceId` (mesmo ID de `/places/search` e de `/home/destinations`), `name`,
  `subtitle` (linha secundária) e `iconUrl` (**sempre preenchido**):
  1. destino curado da Home com o mesmo `providerPlaceId` → imagem do destino (`cardImage`, senão `coverImage`);
  2. caso contrário, ícone padrão do produto por tipo: `/static/place-icons/{city|region|country|place}.svg`,
     servido pelo Core a partir de `assets/place-icons/` (copiado na imagem Docker).
- `latitude`/`longitude` não vêm do autocomplete; use `GET /places/:providerPlaceId`.
- Em produção, defina `PUBLIC_BASE_URL` (https) para montar os `iconUrl` padrão; sem ela, usa o host da requisição.
- A imagem curada é paisagem (card 960px): o app deve usar `cover`/crop quadrado. Trocar por thumbs quadrados no CDN do produto é follow-up.

```bash
curl -s "$BASE/places/autocomplete?q=Roma" | jq
# { "success": true, "data": { "items": [
#   { "providerPlaceId": "ChIJ…", "name": "Roma", "subtitle": "Lácio, Itália",
#     "iconUrl": "https://<host>/static/place-icons/city.svg" } ] }, "timestamp": "…" }
curl -sI "$BASE/static/place-icons/city.svg" | head -1   # 200
```
