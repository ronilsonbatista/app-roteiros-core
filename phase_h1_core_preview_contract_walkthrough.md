# Phase H1 — Core Preview + Paywall Contract Completion Walkthrough

## 1. Summary of Accomplishments

Phase H1 built the secure server-side preview projection and paywall contract for anonymous guest planning journeys (`GuestJourney`) in `approteiros-api`.

- **Architecture Principle**: Built 100% Core-First within `approteiros-api`. Zero new database tables, zero new migrations.
- **Server-Side Filtering (Anti-Leakage)**:
  - Day 1 (or `visibleDayCount`, configurable in Core) is returned fully populated with activities, categories, location, map metadata, images, and provenance (`sourceType`, `sourceId`, `providerPlaceId`).
  - Days 2..N are returned with MINIMAL metadata (`dayNumber`, `date`, `destination`, `locked = true`). Activities and private content of locked days are completely filtered out on the server side and NEVER included in the HTTP JSON response.
- **Paywall Contract & Pricing**:
  - Dynamically queries the `Product` table for `ProductType.ITINERARY_FULL_ACCESS`.
  - Exposes product name, price, currency, and availability directly from the Core database (no hardcoded prices in Flutter).
- **Test Verification**:
  - Created unit and server-side anti-leakage test suite asserting that locked days' activity names and descriptions do NOT appear anywhere in the serialized preview JSON.

---

## 2. Technical Architecture & Endpoints

### 1. Endpoint: `GET /planning-sessions/:id/preview`
- **Guard**: `@UseGuards(GuestTokenGuard)`
- **Header**: `X-Guest-Token`
- **Pre-condition**: `journey.status === 'PREVIEW_READY'` (or `'CLAIMED'`). Rejects requests when in `COLLECTING`, `READY_TO_GENERATE`, `GENERATING`, or `FAILED`.
- **Response DTO**: `PlanningPreviewResponseDto`
  - `summary`: (`destinations`, `startDate`, `endDate`, `totalDays`, `coverImageUrl`)
  - `previewPolicy`: (`visibleDayCount: 1`, `autoPaywallDelaySeconds: 10`)
  - `visibleDays`: Array of fully populated visible days (`activities` with category, time, location, map coords, provenance)
  - `lockedDays`: Array of minimal locked day headers (`dayNumber`, `date`, `destination`, `locked: true`)
  - `unlockOffer`: (`productId`, `code`, `name`, `price`, `currency`, `available`)

---

## 3. Test Verification & Build Results

### Automated Test Suite (`npm run test`)
- 9 test suites, 39 tests passed **100% PASS**.

```text
PASS src/auth/auth.service.spec.ts
PASS src/ai/ai.service.spec.ts
PASS src/auth/auth.controller.spec.ts
PASS src/planning/planning.service.spec.ts
PASS src/users/users.controller.spec.ts
PASS src/ai/curation/curation-retrieval.service.spec.ts
PASS src/prisma/prisma.service.spec.ts
PASS src/app.controller.spec.ts
PASS src/users/users.service.spec.ts

Test Suites: 9 passed, 9 total
Tests:       39 passed, 39 total
Snapshots:   0 total
Time:        1.276 s
```

### Prisma, Build, and OpenAPI Specs
- `npx prisma validate`: **Valid** 🚀
- `npm run build`: **0 errors**
- `npm run openapi:generate`: `openapi.json` exported successfully.

### Git Tracking
- **Commit**: `038118c` (`feat(planning): expose secure guest itinerary preview`)
- **Remote Push**: Pushed to `origin/main` (`github.com:ronilsonbatista/app-roteiros-core.git`).
