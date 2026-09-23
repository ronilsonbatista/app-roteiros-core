-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN     "guestJourneyId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ai_requests_guestJourneyId_idx" ON "ai_requests"("guestJourneyId");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_guestJourneyId_fkey" FOREIGN KEY ("guestJourneyId") REFERENCES "guest_journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
