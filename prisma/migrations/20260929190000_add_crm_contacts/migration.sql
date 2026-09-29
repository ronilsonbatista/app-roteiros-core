CREATE TYPE "CrmContactStatus" AS ENUM ('CONTACT', 'QUALIFIED', 'INACTIVE');
CREATE TABLE "crm_contacts" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "status" "CrmContactStatus" NOT NULL DEFAULT 'CONTACT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crm_contacts_email_key" ON "crm_contacts"("email");
CREATE INDEX "crm_contacts_status_createdAt_idx" ON "crm_contacts"("status", "createdAt");
