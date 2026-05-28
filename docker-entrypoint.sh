#!/bin/sh
set -e

echo "Rodando migrations do Prisma..."
npx prisma migrate deploy

echo "Iniciando aplicação..."
exec npm run start:prod
