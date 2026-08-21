-- DropIndex
DROP INDEX IF EXISTS "webhook_events_providerEventId_key";

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEventId_key" ON "webhook_events"("provider", "providerEventId");
