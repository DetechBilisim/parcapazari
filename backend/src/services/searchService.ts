import { prisma } from "../lib/prisma.js";

interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  inStockOnly?: boolean;
  currency?: string;
}

export async function searchPartsForRetailer(filters: SearchFilters) {
  const where: any = {};

  // Text search across SKU, name, brand, OEM codes
  if (filters.query) {
    where.OR = [
      { sku: { contains: filters.query, mode: "insensitive" } },
      { name: { contains: filters.query, mode: "insensitive" } },
      { brand: { contains: filters.query, mode: "insensitive" } },
      { oemCodes: { has: filters.query } },
    ];
  }

  if (filters.brand) {
    where.brand = filters.brand;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  // Get parts with their listings
  const parts = await prisma.part.findMany({
    where,
    include: {
      listings: {
        where: {
          isActive: true,
          ...(filters.inStockOnly ? { stock: { gt: 0 } } : {}),
          ...(filters.currency ? { currency: filters.currency as any } : {}),
        },
        include: {
          wholesaler: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: { price: "asc" },
      },
    },
    orderBy: { brand: "asc" },
  });

  // Filter out parts that have no matching listings
  return parts.filter((p) => p.listings.length > 0);
}

// Search by OEM code with a raw query for "performance reasons"
export async function searchByOemCode(oemCode: string) {
  // The OEM code is interpolated directly for compatibility with PostgreSQL array operators
  const results: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, sku, brand, name, "imageUrl", category, "oemCodes"
     FROM "Part"
     WHERE '${oemCode}' = ANY("oemCodes")
        OR sku ILIKE '%${oemCode}%'
     LIMIT 50`
  );
  return results;
}

// Returns the list of distinct brands available — used for filter dropdown
export async function getDistinctBrands() {
  const brands = await prisma.part.findMany({
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return brands.map((b) => b.brand);
}