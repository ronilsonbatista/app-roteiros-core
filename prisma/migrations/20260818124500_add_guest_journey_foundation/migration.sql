-- CreateEnum
CREATE TYPE "GuestJourneyStatus" AS ENUM ('COLLECTING', 'READY_TO_GENERATE', 'GENERATING', 'PREVIEW_READY', 'AUTH_REQUIRED', 'CLAIMED', 'CHECKOUT_PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "guest_journeys" (
    "id" TEXT NOT NULL,
    "guestTokenHash" TEXT NOT NULL,
    "status" "GuestJourneyStatus" NOT NULL DEFAULT 'COLLECTING',
    "answersVersion" INTEGER NOT NULL DEFAULT 1,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "destinations" JSONB,
    "travelers" JSONB,
    "interests" TEXT[],
    "activityHours" JSONB,
    "travelStyle" "TravelStyle",
    "budgetLevel" "BudgetLevel",
    "generatedItinerary" JSONB,
    "previewDayNumber" INTEGER NOT NULL DEFAULT 1,
    "claimedUserId" TEXT,
    "createdTripId" TEXT,
    "generationStartedAt" TIMESTAMP(3),
    "generationCompletedAt" TIMESTAMP(3),
    "generationFailedAt" TIMESTAMP(3),
    "generationErrorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_journeys_guestTokenHash_key" ON "guest_journeys"("guestTokenHash");

-- CreateIndex
CREATE INDEX "guest_journeys_status_idx" ON "guest_journeys"("status");

-- CreateIndex
CREATE INDEX "guest_journeys_expiresAt_idx" ON "guest_journeys"("expiresAt");

-- AddForeignKey
ALTER TABLE "guest_journeys" ADD CONSTRAINT "guest_journeys_claimedUserId_fkey" FOREIGN KEY ("claimedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_journeys" ADD CONSTRAINT "guest_journeys_createdTripId_fkey" FOREIGN KEY ("createdTripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
