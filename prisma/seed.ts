import {
  BaseTripStatus,
  BaseTripVisibility,
  PrismaClient,
  Role,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

// Imagens públicas (Wikimedia Commons, HTTPS). `file` = "<hash>/<arquivo codificado>".
const HOME_DESTINATIONS = [
  { slug: 'capadocia', name: 'Capadócia', country: 'Turquia', file: '8/89/Cappadocia_Balloon_Inflating_Wikimedia_Commons.JPG' },
  { slug: 'rio-de-janeiro', name: 'Rio de Janeiro', country: 'Brasil', file: 'a/ae/Christ_on_Corcovado_mountain.JPG' },
  { slug: 'nova-york', name: 'Nova York', country: 'Estados Unidos', file: '5/5f/Manhattan_from_Weehawken%2C_NJ.jpg' },
  { slug: 'paris', name: 'Paris', country: 'França', file: 'b/b7/Paris_-_The_Eiffel_Tower_in_spring_-_2307.jpg' },
  { slug: 'roma', name: 'Roma', country: 'Itália', file: 'd/d8/Colosseum_in_Rome-April_2007-1-_copie_2B.jpg' },
  { slug: 'lisboa', name: 'Lisboa', country: 'Portugal', file: 'f/f6/View_from_Miradouro_de_Santa_Luzia%2C_Lisbon%2C_20250603_2016_9045.jpg' },
  { slug: 'toquio', name: 'Tóquio', country: 'Japão', file: '3/35/Minato_City%2C_Tokyo%2C_Japan.jpg' },
  { slug: 'santorini', name: 'Santorini', country: 'Grécia', file: '2/27/1000_Three_domes_of_Oia_in_Santorini_Photo_by_Giles_Laurent.jpg' },
  { slug: 'machu-picchu', name: 'Machu Picchu', country: 'Peru', file: '6/62/80_-_Machu_Picchu_-_Juin_2009_-_edit.jpg' },
  { slug: 'dubai', name: 'Dubai', country: 'Emirados Árabes Unidos', file: 'c/cc/Dubai_Skyline_mit_Burj_Khalifa_%2818241030269%29.jpg' },
];

function commonsThumb(file: string, width: number): string {
  const name = file.split('/')[2];
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${file}/${width}px-${name}`;
}

// Resolve o providerPlaceId via Google Places Text Search (mesmo provedor de
// GET /places/search). Retorna null sem GOOGLE_MAPS_API_KEY ou sem resultado.
async function resolveProviderPlaceId(d: {
  name: string;
  country: string;
}): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName',
    },
    body: JSON.stringify({
      textQuery: `${d.name}, ${d.country}`,
      languageCode: 'pt-BR',
      pageSize: 1,
    }),
  });
  if (!res.ok) {
    console.warn(`⚠️ Places Text Search falhou para ${d.name}: HTTP ${res.status}`);
    return null;
  }
  const body: any = await res.json();
  const place = body.places?.[0];
  if (place?.id) {
    console.log(`ℹ️ ${d.name} -> ${place.id} (${place.displayName?.text ?? '?'})`);
  }
  return place?.id ?? null;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Seed Product ITINERARY_FULL_ACCESS - Guarded by USER GATE in Production
  const existingProduct = await prisma.product.findFirst({
    where: { type: 'ITINERARY_FULL_ACCESS', active: true },
  });

  if (isProduction) {
    if (!process.env.SEED_PRODUCT_PRICE) {
      console.log(
        'ℹ️ [Production] SEED_PRODUCT_PRICE não fornecido. Seed de ITINERARY_FULL_ACCESS mantido como USER GATE (produto não criado).',
      );
    } else if (!existingProduct) {
      const price = parseFloat(process.env.SEED_PRODUCT_PRICE);
      if (isNaN(price) || price <= 0) {
        throw new Error('SEED_PRODUCT_PRICE inválido fornecido para produção.');
      }
      const product = await prisma.product.create({
        data: {
          type: 'ITINERARY_FULL_ACCESS',
          name: 'Acesso Completo ao Roteiro',
          description: 'Desbloqueio completo do roteiro de viagem personalizado',
          price,
          currency: 'BRL',
          active: true,
        },
      });
      console.log(
        `✅ [Production] Produto ${product.name} (R$ ${price.toFixed(2)}) criado com sucesso!`,
      );
    } else {
      console.log(
        '✅ [Production] Produto ITINERARY_FULL_ACCESS já existe. Ignorando seed de produto.',
      );
    }
  } else {
    // Non-production (Staging / Development)
    if (!existingProduct) {
      const price = process.env.SEED_PRODUCT_PRICE
        ? parseFloat(process.env.SEED_PRODUCT_PRICE)
        : 29.90;
      const product = await prisma.product.create({
        data: {
          type: 'ITINERARY_FULL_ACCESS',
          name: 'Acesso Completo ao Roteiro',
          description: 'Desbloqueio completo do roteiro de viagem personalizado',
          price,
          currency: 'BRL',
          active: true,
        },
      });
      console.log(
        `✅ Produto ${product.name} (R$ ${price.toFixed(2)}) criado com sucesso!`,
      );
    } else {
      console.log(
        '✅ Produto ITINERARY_FULL_ACCESS já existe. Ignorando seed de produto.',
      );
    }
  }

  // Seed Home destinations (catálogo BaseTrip). Idempotente por slug.
  if (process.env.SEED_HOME_DESTINATIONS !== 'false') {
    const missingPlaceIds: string[] = [];
    for (const [index, d] of HOME_DESTINATIONS.entries()) {
      const existing = await prisma.baseTrip.findUnique({
        where: { slug: d.slug },
        select: { providerPlaceId: true },
      });
      const providerPlaceId =
        existing?.providerPlaceId ?? (await resolveProviderPlaceId(d));
      if (!providerPlaceId) missingPlaceIds.push(d.slug);

      const data = {
        title: `Destaque: ${d.name}`,
        destination: d.name,
        country: d.country,
        numberOfDays: 1,
        tags: ['home'],
        coverImage: commonsThumb(d.file, 1920),
        cardImage: commonsThumb(d.file, 960),
        homeSortOrder: index,
        ...(providerPlaceId ? { providerPlaceId } : {}),
        status: BaseTripStatus.PUBLISHED,
        visibility: BaseTripVisibility.PUBLIC,
      };
      await prisma.baseTrip.upsert({
        where: { slug: d.slug },
        create: { slug: d.slug, ...data },
        update: data,
      });
    }
    console.log(
      `✅ ${HOME_DESTINATIONS.length} destinos da Home semeados/atualizados.`,
    );
    if (missingPlaceIds.length > 0) {
      console.warn(
        `⚠️ Sem providerPlaceId (não aparecem em GET /home/destinations): ${missingPlaceIds.join(', ')}. Defina GOOGLE_MAPS_API_KEY e rode o seed novamente.`,
      );
    }
  }

  // Admin Bootstrap - Temporary Secret Lifecycle
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name =
    process.env.SEED_ADMIN_NAME ||
    (isProduction ? 'Administrador 2GO' : 'Administrador Staging');

  if (!email || !password) {
    console.warn(
      '⚠️ SEED_ADMIN_EMAIL ou SEED_ADMIN_PASSWORD não fornecidos. Seed de admin ignorado.',
    );
    return;
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  const forceReset = process.env.SEED_ADMIN_FORCE_RESET === 'true';

  if (existingAdmin) {
    if (!forceReset) {
      console.log(
        `✅ Admin com email ${email} já existe. Para resetar senha, use SEED_ADMIN_FORCE_RESET=true.`,
      );
      return;
    }
    // Secure password reset for existing admin
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: hashedPassword,
        role: Role.ADMIN,
        emailConfirmed: true,
        blockedAt: null,
        archivedAt: null,
      },
    });
    // CRITICAL: NEVER log password or passwordHash
    console.log(`✅ Admin ${existingAdmin.email} (ID: ${existingAdmin.id}) — senha e role atualizados com segurança.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      fullName: name,
      role: Role.ADMIN,
      emailConfirmed: true,
    },
  });

  // CRITICAL: NEVER log password or passwordHash
  console.log(`✅ Admin ${admin.email} (ID: ${admin.id}) criado com sucesso!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
