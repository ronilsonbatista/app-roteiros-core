import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

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

  if (existingAdmin) {
    console.log(
      `✅ Admin com email ${email} já existe. Ignorando seed (não altera admin existente).`,
    );
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
