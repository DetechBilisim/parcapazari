-- CreateEnum
CREATE TYPE "PartCategory" AS ENUM ('BRAKES', 'ENGINE', 'SUSPENSION', 'ELECTRICAL', 'TRANSMISSION', 'EXHAUST', 'COOLING', 'FILTERS', 'BODY', 'INTERIOR', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'EUR', 'USD');

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "oemCodes" TEXT[],
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "PartCategory" NOT NULL,
    "imageUrl" TEXT,
    "vehicleMakes" TEXT[],
    "vehicleModels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartListing" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "wholesalerId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "stock" INTEGER NOT NULL,
    "minOrderQty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

-- CreateIndex
CREATE INDEX "PartListing_partId_idx" ON "PartListing"("partId");

-- CreateIndex
CREATE INDEX "PartListing_wholesalerId_idx" ON "PartListing"("wholesalerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartListing_partId_wholesalerId_key" ON "PartListing"("partId", "wholesalerId");

-- AddForeignKey
ALTER TABLE "PartListing" ADD CONSTRAINT "PartListing_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartListing" ADD CONSTRAINT "PartListing_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
