import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

async function test() {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });
    
    await prisma.$connect();
    console.log('✅ Prisma Client initialized successfully with Adapter');
    await prisma.$disconnect();
    await pool.end();
  } catch (e) {
    console.error('❌ Prisma Client initialization failed');
    console.error(e);
    process.exit(1);
  }
}

test();
