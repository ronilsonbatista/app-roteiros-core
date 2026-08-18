# Phase G3 — AI Orchestration & Async Guest Generation Completion Walkthrough

## 1. Summary of Accomplishments

Phase G3 successfully implemented end-to-end AI orchestration, curated context integration, provenance metadata tagging, and HTTP async generation for anonymous guest planning sessions (`GuestJourney`).

- **Architecture Principle**: Built 100% Core-First within `approteiros-api`.
- **Zero Duplicate AI Infrastructure**: Reused the single existing `AiService`, `OpenAIProvider`, `AIRequest` audit log, `CurationRetrievalService` (from G2), and `PlacesService`.
- **Zero New Database Tables**: Reused existing Prisma models and JSON fields.
- **Provenance Tagging**: Every item in `GuestJourney.generatedItinerary` carries verified provenance (`sourceType`, `sourceId`, `providerPlaceId`).

---

## 2. Technical Architecture & Endpoints

### 1. Context Integration & Provenance Engine (`src/ai/ai.service.ts` & `src/ai/providers/openai.provider.ts`)
- Injects `CurationRetrievalService` into `AiService.generateGuestItinerary()`.
- Formats prompt blocks with curated references when coverage is `STRONG` or `PARTIAL`.
- Normalizes output and resolves item provenance:
  - `sourceType = 'BASE_TRIP' | 'BASE_ATTRACTION' | 'BASE_RESTAURANT'` when matching curated items.
  - `sourceType = 'PLACES'` when matching Google Place IDs.
  - `sourceType = 'AI'` when generated exclusively by model.

### 2. Async HTTP Endpoints & Concurrency (`src/planning/planning.service.ts` & `planning.controller.ts`)
- **`POST /planning-sessions/:id/generate`** (`202 Accepted`):
  - Idempotency & Concurrency Lock: Atomic status update to `GENERATING`. If 10 concurrent requests arrive, only 1 OpenAI background generation is started.
  - Retries & Cooldown: Enforces 60-second cooldown on retries after `FAILED` status.
  - Stale Recovery: Detects generations in `GENERATING` state for >3 minutes and allows recovery.
- **`GET /planning-sessions/:id/generation-status`** (`200 OK`):
  - Returns metadata only (`id`, `status`, `generationStartedAt`, `generationCompletedAt`, `generationFailedAt`, `generationErrorCode`).
  - NEVER leaks `generatedItinerary` or day details.

---

## 3. Test Verification & Build Results

### Automated Test Suite (`npm run test`)
- 9 test suites, 35 tests passed **100% PASS**.

```text
PASS src/ai/ai.service.spec.ts
PASS src/auth/auth.service.spec.ts
PASS src/ai/curation/curation-retrieval.service.spec.ts
PASS src/auth/auth.controller.spec.ts
PASS src/planning/planning.service.spec.ts
PASS src/users/users.controller.spec.ts
PASS src/app.controller.spec.ts
PASS src/prisma/prisma.service.spec.ts
PASS src/users/users.service.spec.ts

Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        1.26 s
```

### Prisma, Build, and OpenAPI Specs
- `npx prisma validate`: **Valid** 🚀
- `npm run build`: **0 errors**
- `npm run openapi:generate`: `openapi.json` exported successfully.

### Git Tracking
- **Commit**: `b65b1c9` (`feat(ai): orchestrate curated guest itinerary generation`)
- **Remote Push**: Pushed to `origin/main` (`github.com:ronilsonbatista/app-roteiros-core.git`).
