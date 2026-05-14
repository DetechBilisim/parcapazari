import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { getProfile, updateProfile } from "../services/userService.js";

export const userRoutes = Router();

userRoutes.use(authenticate);

userRoutes.get("/me", async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const profile = await getProfile(req.user.userId);
  res.json(profile);
});

userRoutes.patch("/me", async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const updated = await updateProfile(req.user.userId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});