import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { prisma } from "../lib/prisma.js";
import { updateProfile } from "../services/userService.js";

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

userRoutes.patch("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const updated = await updateProfile(req.user.userId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
