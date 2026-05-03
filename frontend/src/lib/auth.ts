import { api } from "./api";

export interface User {
  id: string;
  email: string;
  role: "WHOLESALER" | "RETAILER" | "ADMIN";
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED";
  companyName: string;
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("parcapazar_token", data.token);
  localStorage.setItem("parcapazar_user", JSON.stringify(data.user));
  return data.user as User;
}

export async function register(input: {
  email: string;
  password: string;
  role: "WHOLESALER" | "RETAILER";
  companyName: string;
  taxNumber: string;
  contactPhone?: string;
}) {
  const { data } = await api.post("/auth/register", input);
  return data;
}

export function logout() {
  localStorage.removeItem("parcapazar_token");
  localStorage.removeItem("parcapazar_user");
}

export function getCurrentUser(): User | null {
  const stored = localStorage.getItem("parcapazar_user");
  return stored ? JSON.parse(stored) : null;
}
