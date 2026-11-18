-- AlterTable
ALTER TABLE "base_trips" ADD COLUMN     "slug" TEXT,
ADD COLUMN     "cardImage" TEXT,
ADD COLUMN     "homeSortOrder" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "base_trips_slug_key" ON "base_trips"("slug");

-- CreateIndex
CREATE INDEX "base_trips_homeSortOrder_idx" ON "base_trips"("homeSortOrder");
