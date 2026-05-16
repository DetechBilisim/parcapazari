import { api } from "../lib/api";

export interface CartItem {
  id: string;
  partListingId: string;
  quantity: number;
  unitPrice: string;
  currency: "TRY" | "EUR" | "USD";
  partListing: {
    id: string;
    stock: number;
    minOrderQty: number;
    part: {
      sku: string;
      name: string;
      brand: string;
    };
    wholesaler: {
      id: string;
      companyName: string;
    };
  };
}

export interface Cart {
  id: string;
  retailerId: string;
  items: CartItem[];
  discountCode: {
    code: string;
    discountPercent: number;
  } | null;
}

export const cartApi = {
  get: async (): Promise<Cart> => {
    const { data } = await api.get("/cart");
    return data;
  },

  addItem: async (partListingId: string, quantity: number): Promise<Cart> => {
    const { data } = await api.post("/cart/items", { partListingId, quantity });
    return data;
  },

  updateItem: async (itemId: string, quantity: number): Promise<Cart> => {
    const { data } = await api.patch(`/cart/items/${itemId}`, { quantity });
    return data;
  },

  removeItem: async (itemId: string): Promise<Cart> => {
    const { data } = await api.delete(`/cart/items/${itemId}`);
    return data;
  },

  clear: async (): Promise<Cart> => {
    const { data } = await api.post("/cart/clear");
    return data;
  },

  applyDiscount: async (code: string): Promise<Cart> => {
    const { data } = await api.post("/cart/discount", { code });
    return data;
  },

  removeDiscount: async (): Promise<Cart> => {
    const { data } = await api.delete("/cart/discount");
    return data;
  },
};