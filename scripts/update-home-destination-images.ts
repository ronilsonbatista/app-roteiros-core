/**
 * One-shot: rewrite BaseTrip coverImage/cardImage for Home catalog slugs
 * from Wikimedia hotlinks to the site CDN (2go-travel-web-app).
 *
 * Does not touch providerPlaceId / Places. Idempotent.
 *
 * Usage (on Railway core-api shell, with DATABASE_URL):
 *   npx ts-node scripts/update-home-destination-images.ts
 *
 * Optional:
 *   HOME_DESTINATION_IMAGE_BASE_URL=https://2go-travel-web-app.vercel.app
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const HOME_IMAGE_BASE = (
  process.env.HOME_DESTINATION_IMAGE_BASE_URL ||
  'https://2go-travel-web-app.vercel.app'
).replace(/\/$/, '');

const SLUGS = [
  'capadocia',
  'rio-de-janeiro',
  'nova-york',
  'paris',
  'roma',
  'lisboa',
  'toquio',
  'santorini',
  'machu-picchu',
  'dubai',
] as const;

function heroUrl(slug: string): string {
  return `${HOME_IMAGE_BASE}/images/destinations/${slug}/curated-hero.jpg`;
}

function cardUrl(slug: string): string {
  return `${HOME_IMAGE_BASE}/images/destinations/${slug}/curated-guide-card.jpg`;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  let updated = 0;
  let missing = 0;

  try {
    for (const slug of SLUGS) {
      const coverImage = heroUrl(slug);
      const cardImage = cardUrl(slug);
      const result = await prisma.baseTrip.updateMany({
        where: { slug },
        data: { coverImage, cardImage },
      });
      if (result.count === 0) {
        missing += 1;
        console.warn(`⚠️ slug não encontrado em base_trips: ${slug}`);
      } else {
        updated += result.count;
        console.log(`✅ ${slug} → ${coverImage}`);
      }
    }
    console.log(
      `Done. updatedRows=${updated} missingSlugs=${missing} base=${HOME_IMAGE_BASE}`,
    );
    console.log(
      'Note: GET /home/destinations caches 300s (Cache-Control). Wait or restart after verify.',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
