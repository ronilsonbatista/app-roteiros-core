import {
  BaseTripStatus,
  BaseTripVisibility,
  DestinationTipSource,
  PrismaClient,
  Role,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

/** Placeholder Home CRM tips (max 3 per destination). Grok job replaces later. */
const PLACEHOLDER_TIPS: Array<{
  destinationKey: string;
  destinationName: string;
  tips: Array<{ title: string; body: string }>;
}> = [
  {
    destinationKey: 'roma',
    destinationName: 'Roma',
    tips: [
      {
        title: 'Diversifique as formas de pagamento',
        body: 'Leve uma combinação de dinheiro em espécie (para emergências e pequenos gastos), cartão de débito internacional (como Wise ou Nomad) e cartão de crédito tradicional.',
      },
      {
        title: 'Avisos de viagem no cartão',
        body: 'Caso use cartão tradicional, avise o banco no app para evitar bloqueios por compra no exterior.',
      },
      {
        title: 'Água nas fontes',
        body: 'As fontanelle de Roma têm água potável — leve uma garrafa reutilizável e economize com bebidas.',
      },
    ],
  },
  {
    destinationKey: 'paris',
    destinationName: 'Paris',
    tips: [
      {
        title: 'Metrô e Navigo',
        body: 'Para alguns dias, o passe Navigo Easy ou tickets t+ costumam sair mais em conta que táxi no centro.',
      },
      {
        title: 'Horário das atrações',
        body: 'Museus grandes fecham em dias fixos (ex.: Louvre às terças). Confirme antes de montar o dia.',
      },
      {
        title: 'Gorjetas',
        body: 'Serviço já costuma estar incluído na conta; um arredondamento simbólico basta em cafés e bistrôs.',
      },
    ],
  },
  // E2E / CRM trips often use English "Tokyo" → key `tokyo`; catalog uses Tóquio → `toquio`.
  {
    destinationKey: 'tokyo',
    destinationName: 'Tokyo',
    tips: [
      {
        title: 'IC Card (Suica / Pasmo)',
        body: 'Carregue um cartão Suica ou Pasmo no celular ou físico — metrô, trem e conveniência ficam bem mais simples.',
      },
      {
        title: 'Trens e pontualidade',
        body: 'Trens locais e shinkansen são pontuais. Deixe margem entre conexões e confira a linha no app do operador.',
      },
      {
        title: 'Dinheiro e cartão',
        body: 'Muitos lugares aceitam cartão, mas leve ienes para templos, mercados e lojas menores.',
      },
    ],
  },
  {
    destinationKey: 'toquio',
    destinationName: 'Tóquio',
    tips: [
      {
        title: 'IC Card (Suica / Pasmo)',
        body: 'Carregue um cartão Suica ou Pasmo no celular ou físico — metrô, trem e conveniência ficam bem mais simples.',
      },
      {
        title: 'Trens e pontualidade',
        body: 'Trens locais e shinkansen são pontuais. Deixe margem entre conexões e confira a linha no app do operador.',
      },
      {
        title: 'Dinheiro e cartão',
        body: 'Muitos lugares aceitam cartão, mas leve ienes para templos, mercados e lojas menores.',
      },
    ],
  },
];

// Home catalog images: site CDN (2go-travel-web-app), not Wikimedia hotlinks.
// Wikimedia rate-limits Flutter simulators (HTTP 429 → grey placeholders).
// Override base with HOME_DESTINATION_IMAGE_BASE_URL if needed.
const HOME_IMAGE_BASE = (
  process.env.HOME_DESTINATION_IMAGE_BASE_URL ||
  'https://2go-travel-web-app.vercel.app'
).replace(/\/$/, '');

const HOME_DESTINATIONS = [
  { slug: 'capadocia', name: 'Capadócia', country: 'Turquia' },
  { slug: 'rio-de-janeiro', name: 'Rio de Janeiro', country: 'Brasil' },
  { slug: 'nova-york', name: 'Nova York', country: 'Estados Unidos' },
  { slug: 'paris', name: 'Paris', country: 'França' },
  { slug: 'roma', name: 'Roma', country: 'Itália' },
  { slug: 'lisboa', name: 'Lisboa', country: 'Portugal' },
  { slug: 'toquio', name: 'Tóquio', country: 'Japão' },
  { slug: 'santorini', name: 'Santorini', country: 'Grécia' },
  { slug: 'machu-picchu', name: 'Machu Picchu', country: 'Peru' },
  { slug: 'dubai', name: 'Dubai', country: 'Emirados Árabes Unidos' },
];

function siteDestinationHeroUrl(slug: string): string {
  return `${HOME_IMAGE_BASE}/images/destinations/${slug}/curated-hero.jpg`;
}

function siteDestinationCardUrl(slug: string): string {
  return `${HOME_IMAGE_BASE}/images/destinations/${slug}/curated-guide-card.jpg`;
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
        coverImage: siteDestinationHeroUrl(d.slug),
        cardImage: siteDestinationCardUrl(d.slug),
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

  // Seed DestinationTips (Home CRM "Dicas para você"). Idempotente por destinationKey+sortOrder.
  if (process.env.SEED_DESTINATION_TIPS !== 'false') {
    let upserted = 0;
    for (const dest of PLACEHOLDER_TIPS) {
      for (const [sortOrder, tip] of dest.tips.entries()) {
        await prisma.destinationTip.upsert({
          where: {
            destinationKey_sortOrder: {
              destinationKey: dest.destinationKey,
              sortOrder,
            },
          },
          create: {
            destinationKey: dest.destinationKey,
            destinationName: dest.destinationName,
            title: tip.title,
            body: tip.body,
            sortOrder,
            active: true,
            source: DestinationTipSource.PLACEHOLDER,
          },
          update: {
            destinationName: dest.destinationName,
            title: tip.title,
            body: tip.body,
            active: true,
            source: DestinationTipSource.PLACEHOLDER,
          },
        });
        upserted += 1;
      }
    }
    console.log(
      `✅ ${upserted} dicas placeholder (DestinationTip) semeadas/atualizadas.`,
    );
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
