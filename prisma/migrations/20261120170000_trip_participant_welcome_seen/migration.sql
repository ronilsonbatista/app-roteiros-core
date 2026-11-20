-- AlterTable
ALTER TABLE "trip_participants" ADD COLUMN "welcomeSeenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "trip_participants_acceptedById_welcomeSeenAt_idx" ON "trip_participants"("acceptedById", "welcomeSeenAt");
