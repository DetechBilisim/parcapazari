import { prisma } from "../lib/prisma.js";

interface SendMessageInput {
  orderId: string;
  senderId: string;
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
}

export async function sendMessage(input: SendMessageInput) {
  return prisma.message.create({
    data: input,
    include: {
      sender: {
        select: { id: true, companyName: true, role: true },
      },
    },
  });
}

export async function listMessagesForOrder(orderId: string, since?: Date) {
  return prisma.message.findMany({
    where: {
      orderId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    include: {
      sender: {
        select: { id: true, companyName: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOrderForMessaging(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      retailerId: true,
      wholesalerId: true,
      status: true,
    },
  });
}