-- CreateEnum
CREATE TYPE "TravelStyle" AS ENUM ('ECONOMIC', 'COMFORT', 'LUXURY', 'ADVENTURE', 'FAMILY', 'ROMANTIC', 'PARTY', 'CULTURAL');

-- CreateEnum
CREATE TYPE "BudgetLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PREMIUM');

-- CreateTable
CREATE TABLE "user_travel_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "preferredStyles" "TravelStyle"[],
    "budgetLevel" "BudgetLevel",
    "favoriteCountries" TEXT[],
    "favoriteCities" TEXT[],
    "preferredLanguages" TEXT[],
    "foodPreferences" TEXT[],
    "accessibilityNeeds" TEXT[],
    "travelInterests" TEXT[],
    "travelCompanions" TEXT[],
    "avoidedDestinations" TEXT[],
    "preferredClimate" TEXT[],
    "bucketListDestinations" TEXT[],
    "prefersNightlife" BOOLEAN NOT NULL DEFAULT false,
    "prefersNature" BOOLEAN NOT NULL DEFAULT false,
    "prefersGastronomy" BOOLEAN NOT NULL DEFAULT false,
    "prefersMuseums" BOOLEAN NOT NULL DEFAULT false,
    "prefersShopping" BOOLEAN NOT NULL DEFAULT false,
    "prefersRelaxing" BOOLEAN NOT NULL DEFAULT false,
    "averageTripDuration" INTEGER,
    "passportCountry" TEXT,
    "instagramHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_travel_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_travel_profiles_userId_key" ON "user_travel_profiles"("userId");

-- CreateIndex
CREATE INDEX "user_travel_profiles_budgetLevel_idx" ON "user_travel_profiles"("budgetLevel");

-- AddForeignKey
ALTER TABLE "user_travel_profiles" ADD CONSTRAINT "user_travel_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
