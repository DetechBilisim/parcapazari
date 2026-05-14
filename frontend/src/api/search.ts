import { api } from "../lib/api";
import type { Part } from "./listings";

export interface RetailerListing {
  id: string;
  partId: string;
  wholesalerId: string;
  price: string;
  currency: "TRY" | "EUR" | "USD";
  stock: number;
  minOrderQty: number;
  notes: string | null;
  wholesaler: {
    id: string;
    companyName: string;
  };
}

export interface PartWithListings extends Part {
  listings: RetailerListing[];
}

export interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  inStockOnly?: boolean;
  currency?: "TRY" | "EUR" | "USD";
}

export const searchApi = {
  searchParts: async (filters: SearchFilters): Promise<PartWithListings[]> => {
    const params: Record<string, string> = {};
    if (filters.query) params.q = filters.query;
    if (filters.brand) params.brand = filters.brand;
    if (filters.category) params.category = filters.category;
    if (filters.inStockOnly) params.inStockOnly = "true";
    if (filters.currency) params.currency = filters.currency;

    const { data } = await api.get("/search", { params });
    return data;
  },

  searchByOem: async (code: string): Promise<Part[]> => {
    const { data } = await api.get("/search/oem", { params: { code } });
    return data;
  },

  getBrands: async (): Promise<string[]> => {
    const { data } = await api.get("/brands");
    return data;
  },
};