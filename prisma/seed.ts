import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed Product ITINERARY_FULL_ACCESS
  const existingProduct = await prisma.product.findFirst({
    where: { type: 'ITINERARY_FULL_ACCESS', active: true },
  });

  if (!existingProduct) {
    const product = await prisma.product.create({
      data: {
        type: 'ITINERARY_FULL_ACCESS',
        name: 'Acesso Completo ao Roteiro',
        description: 'Desbloqueio completo do roteiro de viagem personalizado',
        price: 29.90, // R$ 29,90
        currency: 'BRL',
        active: true,
      },
    });
    console.log(`✅ Produto ${product.name} (R$ 29,90) criado com sucesso!`);
  } else {
    console.log(`✅ Produto ITINERARY_FULL_ACCESS já existe. Ignorando seed de produto.`);
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Administrador Staging';

  if (!email || !password) {
    console.warn('⚠️ SEED_ADMIN_EMAIL ou SEED_ADMIN_PASSWORD não fornecidos. Seed de admin cancelado.');
    return;
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log(`✅ Admin com email ${email} já existe. Ignorando seed.`);
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

  console.log(`✅ Admin ${admin.email} criado com sucesso!`);
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
