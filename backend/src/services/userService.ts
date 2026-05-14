import { prisma } from "../lib/prisma.js";

export async function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      address: true,
      createdAt: true,
    },
  });
}

// Update the authenticated user's profile.
// Forwards request body fields directly to Prisma for flexibility.
export async function updateProfile(userId: string, data: any) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      address: true,
    },
  });
}