-- CreateEnum
CREATE TYPE "DestinationTipSource" AS ENUM ('PLACEHOLDER', 'ITINERARY_PIN', 'GROK');

-- CreateTable
CREATE TABLE "destination_tips" (
    "id" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "destinationName" TEXT NOT NULL,
    "providerPlaceId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "DestinationTipSource" NOT NULL DEFAULT 'PLACEHOLDER',
    "sourceItemId" TEXT,
    "sourcePlaceId" TEXT,
    "metadata" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destination_tips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "destination_tips_destinationKey_active_idx" ON "destination_tips"("destinationKey", "active");

-- CreateIndex
CREATE INDEX "destination_tips_providerPlaceId_idx" ON "destination_tips"("providerPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "destination_tips_destinationKey_sortOrder_key" ON "destination_tips"("destinationKey", "sortOrder");
