-- CreateEnum
CREATE TYPE "TransitMode" AS ENUM ('WALKING', 'DRIVING', 'TRANSIT', 'BICYCLING');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('FREE', 'TICKET_REQUIRED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN "arrivalDateTime" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "departureDateTime" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "allowedSwapsCount" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "trips" ADD COLUMN "usedSwapsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "itinerary_items" ADD COLUMN "transitDistanceMeters" INTEGER;
ALTER TABLE "itinerary_items" ADD COLUMN "transitDurationMinutes" INTEGER;
ALTER TABLE "itinerary_items" ADD COLUMN "transitMode" "TransitMode" NOT NULL DEFAULT 'WALKING';
ALTER TABLE "itinerary_items" ADD COLUMN "ticketStatus" "TicketStatus" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "trip_accommodations" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "neighborhood" TEXT,
    "zipCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "providerPlaceId" TEXT,
    "checkInDateTime" TIMESTAMP(3),
    "checkOutDateTime" TIMESTAMP(3),
    "checkInDate" TIMESTAMP(3),
    "checkInTime" TEXT,
    "checkOutDate" TIMESTAMP(3),
    "checkOutTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_accommodations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_accommodations_tripId_key" ON "trip_accommodations"("tripId");

-- AddForeignKey
ALTER TABLE "trip_accommodations" ADD CONSTRAINT "trip_accommodations_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
