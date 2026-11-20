-- Banco exclusivo do image bank (IMAGE_BANK_DATABASE_URL).
-- Não referencia tabelas do core. O binário não fica aqui: só a chave e os metadados.

-- CreateEnum
CREATE TYPE "ImageBankStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ImageBankImageVariant" AS ENUM ('ORIGINAL', 'THUMB', 'CARD');

-- CreateTable
CREATE TABLE "image_bank_destinations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "summary" TEXT,
    "status" "ImageBankStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_bank_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_bank_cities" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ImageBankStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_bank_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_bank_spot_images" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "spotName" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "variant" "ImageBankImageVariant" NOT NULL DEFAULT 'ORIGINAL',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "derivedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_bank_spot_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_bank_destinations_slug_key" ON "image_bank_destinations"("slug");

-- CreateIndex
CREATE INDEX "image_bank_destinations_status_idx" ON "image_bank_destinations"("status");

-- CreateIndex
CREATE INDEX "image_bank_cities_destinationId_sortOrder_idx" ON "image_bank_cities"("destinationId", "sortOrder");

-- CreateIndex
CREATE INDEX "image_bank_cities_status_idx" ON "image_bank_cities"("status");

-- CreateIndex
CREATE UNIQUE INDEX "image_bank_cities_destinationId_slug_key" ON "image_bank_cities"("destinationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "image_bank_spot_images_storageKey_key" ON "image_bank_spot_images"("storageKey");

-- CreateIndex
CREATE INDEX "image_bank_spot_images_derivedFromId_idx" ON "image_bank_spot_images"("derivedFromId");

-- CreateIndex
CREATE UNIQUE INDEX "image_bank_spot_images_cityId_variant_sortOrder_key" ON "image_bank_spot_images"("cityId", "variant", "sortOrder");

-- AddForeignKey
ALTER TABLE "image_bank_cities" ADD CONSTRAINT "image_bank_cities_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "image_bank_destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_bank_spot_images" ADD CONSTRAINT "image_bank_spot_images_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "image_bank_cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_bank_spot_images" ADD CONSTRAINT "image_bank_spot_images_derivedFromId_fkey" FOREIGN KEY ("derivedFromId") REFERENCES "image_bank_spot_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
