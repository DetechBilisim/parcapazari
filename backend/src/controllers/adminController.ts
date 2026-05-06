import type { Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export async function listPendingUsers(_req: AuthenticatedRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { status: "PENDING_APPROVAL" },
    select: {
      id: true,
      email: true,
      role: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      createdAt: true,
    },
  });
  res.json(users);
}

export async function approveUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const user = await prisma.user.update({
    where: { id: userId as string },
    data: { status: "ACTIVE" },
  });
  res.json({ message: "User approved", user });
}

export async function rejectUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  await prisma.user.delete({ where: { id: userId as string } });
  res.json({ message: "User rejected and removed" });
}
