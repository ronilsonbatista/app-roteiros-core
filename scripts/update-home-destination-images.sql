-- One-shot SQL: Home destination images → site CDN (no Wikimedia).
-- Run on staging Postgres (Railway core-api / public proxy). Idempotent.
-- After: wait ≤300s for GET /home/destinations cache, or restart core-api.

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/capadocia/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/capadocia/curated-guide-card.jpg'
WHERE "slug" = 'capadocia';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/rio-de-janeiro/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/rio-de-janeiro/curated-guide-card.jpg'
WHERE "slug" = 'rio-de-janeiro';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/nova-york/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/nova-york/curated-guide-card.jpg'
WHERE "slug" = 'nova-york';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/paris/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/paris/curated-guide-card.jpg'
WHERE "slug" = 'paris';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/roma/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/roma/curated-guide-card.jpg'
WHERE "slug" = 'roma';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/lisboa/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/lisboa/curated-guide-card.jpg'
WHERE "slug" = 'lisboa';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/toquio/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/toquio/curated-guide-card.jpg'
WHERE "slug" = 'toquio';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/santorini/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/santorini/curated-guide-card.jpg'
WHERE "slug" = 'santorini';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/machu-picchu/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/machu-picchu/curated-guide-card.jpg'
WHERE "slug" = 'machu-picchu';

UPDATE "base_trips"
SET
  "coverImage" = 'https://2go-travel-web-app.vercel.app/images/destinations/dubai/curated-hero.jpg',
  "cardImage"  = 'https://2go-travel-web-app.vercel.app/images/destinations/dubai/curated-guide-card.jpg'
WHERE "slug" = 'dubai';
