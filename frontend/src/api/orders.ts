import { api } from "../lib/api";

export interface OrderItem {
  id: string;
  partSku: string;
  partName: string;
  partBrand: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status:
    | "PENDING_PAYMENT"
    | "PAID"
    | "CONFIRMED"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED";
  subtotal: string;
  discountAmount: string;
  total: string;
  currency: "TRY" | "EUR" | "USD";
  discountCode: string | null;
  shippingAddress: string | null;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  retailer?: { id: string; companyName: string; contactPhone: string | null };
  wholesaler?: { id: string; companyName: string };
}

export const ordersApi = {
  checkout: async (shippingAddress: string, notes: string): Promise<Order[]> => {
    const { data } = await api.post("/checkout", { shippingAddress, notes });
    return data.orders;
  },

  myOrders: async (): Promise<Order[]> => {
    const { data } = await api.get("/orders");
    return data;
  },

  getOrder: async (orderId: string): Promise<Order> => {
    const { data } = await api.get(`/orders/${orderId}`);
    return data;
  },

  updateStatus: async (orderId: string, status: Order["status"]): Promise<Order> => {
    const { data } = await api.patch(`/orders/${orderId}/status`, { status });
    return data;
  },
};