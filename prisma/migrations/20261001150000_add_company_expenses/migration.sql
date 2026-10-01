-- CreateEnum
CREATE TYPE "CompanyExpenseCategory" AS ENUM ('INFRA', 'SAAS', 'MARKETING', 'PESSOAS', 'VIAGEM', 'OUTROS');

-- CreateTable
CREATE TABLE "company_expenses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CompanyExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "spentAt" TIMESTAMP(3) NOT NULL,
    "competenceMonth" TEXT NOT NULL,
    "vendor" TEXT,
    "notes" TEXT,
    "createdByAdminId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_expenses_competenceMonth_spentAt_idx" ON "company_expenses"("competenceMonth", "spentAt");

-- CreateIndex
CREATE INDEX "company_expenses_category_idx" ON "company_expenses"("category");

-- CreateIndex
CREATE INDEX "company_expenses_archivedAt_idx" ON "company_expenses"("archivedAt");

-- AddForeignKey
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
