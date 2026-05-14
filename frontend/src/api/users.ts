import { api } from "../lib/api";

export interface UserProfile {
  id: string;
  email: string;
  role: "WHOLESALER" | "RETAILER" | "ADMIN";
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED";
  companyName: string;
  taxNumber: string;
  contactPhone: string | null;
  address: string | null;
}

export const usersApi = {
  getMe: async (): Promise<UserProfile> => {
    const { data } = await api.get("/users/me");
    return data;
  },

  updateMe: async (input: Partial<{
    companyName: string;
    contactPhone: string;
    address: string;
  }>): Promise<UserProfile> => {
    const { data } = await api.patch("/users/me", input);
    return data;
  },
};