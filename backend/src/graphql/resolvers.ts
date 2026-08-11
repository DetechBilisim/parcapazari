import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/client";

interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  currency?: string;
  inStockOnly?: boolean;
  sortBy?: "PRICE_ASC" | "PRICE_DESC" | "NEWEST" | "BRAND_ASC";
}

export const resolvers = {
  Query: {
    parts: async (
      _: any,
      args: { filters?: SearchFilters; limit?: number; offset?: number }
    ) => {
      const filters = args.filters || {};
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const where: any = {};

      if (filters.query) {
        where.OR = [
          { sku: { contains: filters.query, mode: "insensitive" } },
          { name: { contains: filters.query, mode: "insensitive" } },
          { brand: { contains: filters.query, mode: "insensitive" } },
          { oemCodes: { has: filters.query } },
        ];
      }

      if (filters.brand) where.brand = filters.brand;
      if (filters.category) where.category = filters.category;
      if (filters.inStockOnly) {
        where.listings = { some: { isActive: true, stock: { gt: 0 } } };
      }

      const orderBy: any =
        filters.sortBy === "NEWEST"
          ? { createdAt: "desc" }
          : filters.sortBy === "BRAND_ASC"
          ? { brand: "asc" }
          : { brand: "asc" };

      const [items, totalCount] = await Promise.all([
        prisma.part.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        prisma.part.count({ where }),
      ]);

      return {
        items,
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },

    part: async (_: any, args: { id?: string; sku?: string }) => {
      if (args.id) {
        return prisma.part.findUnique({ where: { id: args.id } });
      }
      if (args.sku) {
        return prisma.part.findUnique({ where: { sku: args.sku } });
      }
      return null;
    },

    // Search parts by OEM code using a raw query for compatibility with PostgreSQL array operators
    partByOemCode: async (_: any, args: { oemCode: string }) => {
      const results: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, sku, brand, name, "imageUrl", category, "oemCodes", "vehicleMakes", "vehicleModels", description
         FROM "Part"
         WHERE $1 = ANY("oemCodes")
            OR sku ILIKE $2
         LIMIT 50`,
        args.oemCode,
        `%${args.oemCode}%`
      );
      return results;
    },

    brands: async () => {
      const rows = await prisma.part.findMany({
        select: { brand: true },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      });
      return rows.map((r) => r.brand);
    },

    listing: async (_: any, args: { id: string }) => {
      return prisma.partListing.findUnique({
        where: { id: args.id },
      });
    },
  },

  Part: {
    listings: async (parent: any, args: { inStockOnly?: boolean }) => {
      return prisma.partListing.findMany({
        where: {
          partId: parent.id,
          isActive: true,
          ...(args.inStockOnly ? { stock: { gt: 0 } } : {}),
        },
        orderBy: { price: "asc" },
      });
    },

    listingCount: async (parent: any) => {
      return prisma.partListing.count({
        where: { partId: parent.id, isActive: true },
      });
    },

    lowestPrice: async (parent: any) => {
      const cheapest = await prisma.partListing.findFirst({
        where: { partId: parent.id, isActive: true, stock: { gt: 0 } },
        orderBy: { price: "asc" },
        select: { price: true, currency: true },
      });
      return cheapest ? `${cheapest.price} ${cheapest.currency}` : null;
    },
  },

  PartListing: {
    part: async (parent: any) => {
      return prisma.part.findUnique({ where: { id: parent.partId } });
    },

    wholesaler: async (parent: any) => {
      return prisma.user.findUnique({
        where: { id: parent.wholesalerId },
        select: { id: true, companyName: true },
      });
    },
  },
};