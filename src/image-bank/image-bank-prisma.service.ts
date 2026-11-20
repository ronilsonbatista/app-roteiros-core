import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/image-bank-client';
import { Pool } from 'pg';

/**
 * Conexão exclusiva do image bank (IMAGE_BANK_DATABASE_URL).
 * Não é o PrismaService global e não é exportada pelo módulo:
 * o restante do core não injeta este client.
 */
@Injectable()
export class ImageBankPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.IMAGE_BANK_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'IMAGE_BANK_DATABASE_URL é obrigatória. O banco de imagens é um PostgreSQL separado do DATABASE_URL.',
      );
    }
    const pool = new Pool({ connectionString });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
