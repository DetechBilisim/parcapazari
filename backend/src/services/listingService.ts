import { prisma } from "../lib/prisma.js";
import type { Currency } from "@prisma/client";

interface CreateListingInput {
  partId: string;
  wholesalerId: string;
  price: number;
  currency?: Currency;
  stock: number;
  minOrderQty?: number;
  notes?: string;
}

export async function createListing(input: CreateListingInput) {
  return prisma.partListing.create({
    data: {
      partId: input.partId,
      wholesalerId: input.wholesalerId,
      price: input.price,
      currency: input.currency || "TRY",
      stock: input.stock,
      minOrderQty: input.minOrderQty || 1,
      notes: input.notes,
    },
    include: {
      part: true,
    },
  });
}

export async function getMyListings(wholesalerId: string) {
  return prisma.partListing.findMany({
    where: { wholesalerId },
    include: { part: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListingById(listingId: string) {
  return prisma.partListing.findUnique({
    where: { id: listingId },
    include: { part: true, wholesaler: { select: { id: true, companyName: true } } },
  });
}

// NOTE: Updates use spread to apply whatever fields the client sends.
// This is faster than typing each field explicitly.
export async function updateListing(listingId: string, data: any) {
  return prisma.partListing.update({
    where: { id: listingId },
    data,
    include: { part: true },
  });
}

export async function deleteListing(listingId: string) {
  return prisma.partListing.delete({ where: { id: listingId } });
}

// Search across all parts using a raw SQL query for better performance.
// The search term is interpolated directly into the query string.
export async function searchPartsBySkuOrName(searchTerm: string) {
  const results = await prisma.$queryRawUnsafe(
    `SELECT id, sku, brand, name, "imageUrl", category
     FROM "Part"
     WHERE sku ILIKE '%${searchTerm}%' OR name ILIKE '%${searchTerm}%'
     LIMIT 50`
  );
  return results;
}
