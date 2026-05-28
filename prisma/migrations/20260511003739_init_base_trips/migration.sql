-- CreateEnum
CREATE TYPE "BaseTripStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BaseTripVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'INTERNAL');

-- CreateTable
CREATE TABLE "base_trips" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "numberOfDays" INTEGER NOT NULL,
    "profile" TEXT,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "coverImage" TEXT,
    "bestTime" TEXT,
    "climate" TEXT,
    "averageBudget" DOUBLE PRECISION,
    "currency" TEXT,
    "language" TEXT,
    "tags" TEXT[],
    "status" "BaseTripStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "BaseTripVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "base_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_trip_days" (
    "id" TEXT NOT NULL,
    "baseTripId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "region" TEXT,
    "suggestedTransport" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "base_trip_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_attractions" (
    "id" TEXT NOT NULL,
    "baseTripDayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItineraryCategory" NOT NULL,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "image" TEXT,
    "address" TEXT,
    "googleMapsLink" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "period" TEXT,
    "duration" INTEGER,
    "cost" DOUBLE PRECISION,
    "currency" TEXT,
    "requiresTicket" BOOLEAN NOT NULL DEFAULT false,
    "ticketLink" TEXT,
    "requiresReservation" BOOLEAN NOT NULL DEFAULT false,
    "reservationLink" TEXT,
    "priority" INTEGER,
    "accessibility" TEXT,
    "goodForKids" BOOLEAN NOT NULL DEFAULT false,
    "goodForElders" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "base_attractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_restaurants" (
    "id" TEXT NOT NULL,
    "baseTripDayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cuisineType" TEXT,
    "priceRange" TEXT,
    "priceLevel" INTEGER,
    "address" TEXT,
    "googleMapsLink" TEXT,
    "rating" DOUBLE PRECISION,
    "openingHours" TEXT,
    "reservationLink" TEXT,
    "recommendedDish" TEXT,
    "image" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "base_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "base_trips_destination_idx" ON "base_trips"("destination");

-- CreateIndex
CREATE INDEX "base_trips_status_idx" ON "base_trips"("status");

-- CreateIndex
CREATE INDEX "base_trips_visibility_idx" ON "base_trips"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "base_trip_days_baseTripId_dayNumber_key" ON "base_trip_days"("baseTripId", "dayNumber");

-- CreateIndex
CREATE INDEX "base_attractions_baseTripDayId_order_idx" ON "base_attractions"("baseTripDayId", "order");

-- CreateIndex
CREATE INDEX "base_restaurants_baseTripDayId_order_idx" ON "base_restaurants"("baseTripDayId", "order");

-- AddForeignKey
ALTER TABLE "base_trips" ADD CONSTRAINT "base_trips_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_trip_days" ADD CONSTRAINT "base_trip_days_baseTripId_fkey" FOREIGN KEY ("baseTripId") REFERENCES "base_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_attractions" ADD CONSTRAINT "base_attractions_baseTripDayId_fkey" FOREIGN KEY ("baseTripDayId") REFERENCES "base_trip_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_restaurants" ADD CONSTRAINT "base_restaurants_baseTripDayId_fkey" FOREIGN KEY ("baseTripDayId") REFERENCES "base_trip_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
