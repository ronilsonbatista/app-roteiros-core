#!/bin/sh
set -e

echo "Rodando migrations do Prisma..."
npx prisma migrate deploy

if [ -n "${IMAGE_BANK_DATABASE_URL:-}" ]; then
  echo "Rodando migrations do image bank..."
  npx prisma migrate deploy --config prisma/image-bank/prisma.config.ts
else
  echo "IMAGE_BANK_DATABASE_URL ausente — pulando migrations do image bank."
fi

echo "Iniciando aplicação..."
exec npm run start:prod
