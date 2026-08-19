-- AlterTable
ALTER TABLE "products" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "purchases"
  ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2),
  ADD COLUMN "originalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "finalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerPaymentId" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

-- Populate originalAmount and finalAmount for existing purchases from amount
UPDATE "purchases" SET "originalAmount" = "amount", "finalAmount" = "amount" WHERE "originalAmount" = 0.00;

-- Remove temporary defaults
ALTER TABLE "purchases" ALTER COLUMN "originalAmount" DROP DEFAULT;
ALTER TABLE "purchases" ALTER COLUMN "finalAmount" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "purchases_idempotencyKey_key" ON "purchases"("idempotencyKey");
