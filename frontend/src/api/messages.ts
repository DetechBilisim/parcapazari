import { api } from "../lib/api";

export interface Message {
  id: string;
  orderId: string;
  senderId: string;
  content: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  createdAt: string;
  sender: {
    id: string;
    companyName: string;
    role: "RETAILER" | "WHOLESALER" | "ADMIN";
  };
}

export const messagesApi = {
  list: async (orderId: string, since?: Date): Promise<Message[]> => {
    const params: Record<string, string> = {};
    if (since) params.since = since.toISOString();
    const { data } = await api.get(`/orders/${orderId}/messages`, { params });
    return data;
  },

  send: async (
    orderId: string,
    content: string,
    attachment?: File
  ): Promise<Message> => {
    const formData = new FormData();
    formData.append("orderId", orderId);
    formData.append("content", content);
    if (attachment) formData.append("attachment", attachment);

    const { data } = await api.post("/messages", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};