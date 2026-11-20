import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Postgres exclusivo do image bank. Não aponta para DATABASE_URL nem para o
// service `db` do docker compose. Caminhos relativos a este arquivo.
export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
    seed: 'npx ts-node prisma/image-bank/seed.ts',
  },
  datasource: {
    url: process.env.IMAGE_BANK_DATABASE_URL,
  },
});