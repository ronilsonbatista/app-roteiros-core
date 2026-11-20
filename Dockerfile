# Base image
FROM node:22-alpine  AS builder

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source code
COPY . .

# Build the app and generate prisma client
RUN npx prisma generate && IMAGE_BANK_DATABASE_URL="postgresql://unused:unused@127.0.0.1:5432/image_bank" npx prisma generate --config prisma/image-bank/prisma.config.ts
RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/assets ./assets

# Create uploads directory
RUN mkdir -p /app/uploads

# Entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

CMD ["/app/docker-entrypoint.sh"]
