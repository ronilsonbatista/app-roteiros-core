import {
  ImageBankImageVariant,
  ImageBankStatus,
  PrismaClient,
} from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

/** PNG 1x1. Placeholder de formato — não é a foto HD. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface FixtureImage {
  sortOrder: number;
  spotName: string;
  altText: string;
}

interface FixtureCity {
  slug: string;
  name: string;
  summary: string;
  sortOrder: number;
  status: ImageBankStatus;
  images: FixtureImage[];
}

interface FixtureDestination {
  slug: string;
  name: string;
  country: string;
  region: string;
  summary: string;
  status: ImageBankStatus;
  cities: FixtureCity[];
}

const FIXTURES: FixtureDestination[] = [
  {
    slug: 'paris',
    name: 'Paris',
    country: 'França',
    region: 'Ilha de França',
    summary:
      'Rascunho com uma cidade e menos de 5 imagens. O caso comum é 1 cidade por destino.',
    status: ImageBankStatus.DRAFT,
    cities: [
      {
        slug: 'paris',
        name: 'Paris',
        summary: 'Rascunho pode ter menos de 5 fotos.',
        sortOrder: 0,
        status: ImageBankStatus.DRAFT,
        images: [
          {
            sortOrder: 1,
            spotName: 'Torre Eiffel',
            altText: 'Torre Eiffel vista do Campo de Marte',
          },
          {
            sortOrder: 2,
            spotName: 'Museu do Louvre',
            altText: 'Pirâmide do Louvre e fachada do palácio',
          },
        ],
      },
    ],
  },
  {
    slug: 'rio-de-janeiro',
    name: 'Rio de Janeiro',
    country: 'Brasil',
    region: 'Sudeste',
    summary:
      'Destino publicado. A cidade do Rio tem 5 fotos; Niterói continua em rascunho.',
    status: ImageBankStatus.PUBLISHED,
    cities: [
      {
        slug: 'rio-de-janeiro',
        name: 'Rio de Janeiro',
        summary: 'Cidade publicada: exatamente 5 imagens de pontos turísticos.',
        sortOrder: 0,
        status: ImageBankStatus.PUBLISHED,
        images: [
          {
            sortOrder: 1,
            spotName: 'Cristo Redentor',
            altText: 'Cristo Redentor no Corcovado',
          },
          {
            sortOrder: 2,
            spotName: 'Pão de Açúcar',
            altText: 'Pão de Açúcar e baía de Guanabara',
          },
          {
            sortOrder: 3,
            spotName: 'Escadaria Selarón',
            altText: 'Escadaria Selarón na Lapa',
          },
          {
            sortOrder: 4,
            spotName: 'Praia de Copacabana',
            altText: 'Calçadão e praia de Copacabana',
          },
          {
            sortOrder: 5,
            spotName: 'Jardim Botânico',
            altText: 'Aleia de palmeiras do Jardim Botânico',
          },
        ],
      },
      {
        slug: 'niteroi',
        name: 'Niterói',
        summary: 'Segunda cidade do mesmo destino, ainda em rascunho.',
        sortOrder: 1,
        status: ImageBankStatus.DRAFT,
        images: [
          {
            sortOrder: 1,
            spotName: 'MAC Niterói',
            altText: 'Museu de Arte Contemporânea de Niterói',
          },
        ],
      },
    ],
  },
];

function spotSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function storageKey(
  destinationSlug: string,
  citySlug: string,
  image: FixtureImage,
): string {
  const order = String(image.sortOrder).padStart(2, '0');
  return `image-bank/${destinationSlug}/${citySlug}/${order}-${spotSlug(image.spotName)}.png`;
}

function localFixturePath(key: string): string {
  return path.join(process.cwd(), 'uploads', key);
}

function fixtureS3Client(): S3Client | null {
  if ((process.env.MEDIA_STORAGE_PROVIDER || 'local') !== 's3') return null;
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID) return null;
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });
}

async function putFixtureObject(
  key: string,
  s3: S3Client | null,
): Promise<void> {
  const localPath = localFixturePath(key);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, PNG_1X1);
  if (!s3 || !process.env.S3_BUCKET) return;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: PNG_1X1,
      ContentType: 'image/png',
    }),
  );
}

/**
 * Fixture mínima do banco de imagens. Não baixa fotos reais.
 * Os arquivos são PNG 1x1 só para o formato da linha e da chave existirem.
 */
export async function seedImageBank(prisma: PrismaClient): Promise<void> {
  const s3 = fixtureS3Client();
  if ((process.env.MEDIA_STORAGE_PROVIDER || 'local') === 's3' && !s3) {
    console.warn(
      '⚠️ Banco de imagens: MEDIA_STORAGE_PROVIDER=s3 sem bucket/credenciais. Placeholders ficam só em ./uploads.',
    );
  }

  try {
    for (const fixture of FIXTURES) {
      const baseTrip = await prisma.baseTrip.findUnique({
        where: { slug: fixture.slug },
        select: { id: true },
      });
      const destination = await prisma.imageBankDestination.upsert({
        where: { slug: fixture.slug },
        create: {
          slug: fixture.slug,
          name: fixture.name,
          country: fixture.country,
          region: fixture.region,
          summary: fixture.summary,
          status: fixture.status,
          baseTripId: baseTrip?.id ?? null,
        },
        update: {
          name: fixture.name,
          country: fixture.country,
          region: fixture.region,
          summary: fixture.summary,
          status: fixture.status,
          ...(baseTrip ? { baseTripId: baseTrip.id } : {}),
        },
      });

      const cityIds: string[] = [];
      for (const cityFixture of fixture.cities) {
        const city = await prisma.imageBankCity.upsert({
          where: {
            destinationId_slug: {
              destinationId: destination.id,
              slug: cityFixture.slug,
            },
          },
          create: {
            destinationId: destination.id,
            slug: cityFixture.slug,
            name: cityFixture.name,
            summary: cityFixture.summary,
            sortOrder: cityFixture.sortOrder,
            status: cityFixture.status,
          },
          update: {
            name: cityFixture.name,
            summary: cityFixture.summary,
            sortOrder: cityFixture.sortOrder,
            status: cityFixture.status,
          },
        });
        cityIds.push(city.id);

        await prisma.imageBankSpotImage.deleteMany({
          where: { cityId: city.id },
        });
        for (const image of cityFixture.images) {
          const key = storageKey(fixture.slug, cityFixture.slug, image);
          try {
            await putFixtureObject(key, s3);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'erro';
            console.warn(`⚠️ Falha ao gravar placeholder ${key}: ${message}`);
          }
          await prisma.imageBankSpotImage.create({
            data: {
              cityId: city.id,
              spotName: image.spotName,
              altText: image.altText,
              sortOrder: image.sortOrder,
              variant: ImageBankImageVariant.ORIGINAL,
              storageKey: key,
              mimeType: 'image/png',
              width: 1,
              height: 1,
              bytes: PNG_1X1.length,
            },
          });
        }
      }

      console.log(
        `✅ Banco de imagens: ${fixture.slug} (${fixture.status}) com ${cityIds.length} cidade(s).`,
      );
    }

    console.log(
      'ℹ️ Placeholders são PNG 1x1 em uploads/image-bank (não são as fotos HD). ' +
        'MEDIA_STORAGE_PROVIDER=local serve esses arquivos em MEDIA_BASE_URL. ' +
        'Com s3/MinIO o seed também tenta o PutObject dos mesmos placeholders.',
    );
  } finally {
    s3?.destroy();
  }
}
