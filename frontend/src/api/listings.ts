import { api } from "../lib/api";

export interface Part {
  id: string;
  sku: string;
  oemCodes: string[];
  brand: string;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  vehicleMakes: string[];
  vehicleModels: string[];
}

export interface PartListing {
  id: string;
  partId: string;
  wholesalerId: string;
  price: string;
  currency: "TRY" | "EUR" | "USD";
  stock: number;
  minOrderQty: number;
  isActive: boolean;
  notes: string | null;
  part: Part;
}

export const listingsApi = {
  getCatalog: async (): Promise<Part[]> => {
    const { data } = await api.get("/parts");
    return data;
  },

  searchCatalog: async (query: string): Promise<Part[]> => {
    const { data } = await api.get("/parts/search", { params: { q: query } });
    return data;
  },

  getMyListings: async (): Promise<PartListing[]> => {
    const { data } = await api.get("/listings");
    return data;
  },

  createListing: async (input: {
    partId: string;
    price: number;
    currency: "TRY" | "EUR" | "USD";
    stock: number;
    minOrderQty?: number;
    notes?: string;
  }): Promise<PartListing> => {
    const { data } = await api.post("/listings", input);
    return data;
  },

  updateListing: async (
    listingId: string,
    input: Partial<{
      price: number;
      currency: "TRY" | "EUR" | "USD";
      stock: number;
      minOrderQty: number;
      isActive: boolean;
      notes: string;
    }>
  ): Promise<PartListing> => {
    const { data } = await api.patch(`/listings/${listingId}`, input);
    return data;
  },

  deleteListing: async (listingId: string): Promise<void> => {
    await api.delete(`/listings/${listingId}`);
  },
};
