-- AlterTable
ALTER TABLE "base_attractions" ADD COLUMN     "placeProvider" TEXT,
ADD COLUMN     "providerPlaceId" TEXT;

-- AlterTable
ALTER TABLE "base_restaurants" ADD COLUMN     "placeProvider" TEXT,
ADD COLUMN     "providerPlaceId" TEXT;

-- AlterTable
ALTER TABLE "itinerary_items" ADD COLUMN     "placeProvider" TEXT,
ADD COLUMN     "providerPlaceId" TEXT;

-- CreateIndex
CREATE INDEX "base_attractions_providerPlaceId_idx" ON "base_attractions"("providerPlaceId");

-- CreateIndex
CREATE INDEX "base_restaurants_providerPlaceId_idx" ON "base_restaurants"("providerPlaceId");

-- CreateIndex
CREATE INDEX "itinerary_items_providerPlaceId_idx" ON "itinerary_items"("providerPlaceId");
