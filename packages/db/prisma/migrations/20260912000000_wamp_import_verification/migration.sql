-- CreateEnum
CREATE TYPE "ContactVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFYING', 'NEEDS_HUMAN', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ContactMethodKind" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "LegacyImportModel" AS ENUM ('Contact', 'Company', 'ContactMethod', 'Activity');

-- AlterTable
ALTER TABLE "company" ADD COLUMN "streetAddress" TEXT;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN "streetAddress" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "stateCode" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "verificationStatus" "ContactVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "contactMethod" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "ContactMethodKind" NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,

    CONSTRAINT "contactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacyImportMapping" (
    "id" TEXT NOT NULL,
    "legacyTable" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "model" "LegacyImportModel" NOT NULL,
    "crmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacyImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contactMethod_contactId_kind_value_key" ON "contactMethod"("contactId", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "legacyImportMapping_legacyTable_legacyId_key" ON "legacyImportMapping"("legacyTable", "legacyId");

-- AddForeignKey
ALTER TABLE "contactMethod" ADD CONSTRAINT "contactMethod_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
