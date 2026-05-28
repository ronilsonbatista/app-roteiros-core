/*
  Warnings:

  - Made the column `provider` on table `ai_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `model` on table `ai_requests` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ai_requests" ALTER COLUMN "provider" SET NOT NULL,
ALTER COLUMN "model" SET NOT NULL;
