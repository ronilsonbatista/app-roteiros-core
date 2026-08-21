-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterEnum
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'CHARGEBACK';

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "couponId" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "chargebackAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "productType" "ProductType" DEFAULT 'ITINERARY_FULL_ACCESS',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchases_couponId_idx" ON "purchases"("couponId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
