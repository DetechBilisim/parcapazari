import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { prisma } from "../lib/prisma.js";

export const userRoutes = Router();

userRoutes.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      createdAt: true,
    },
  });

  res.json(user);
});
