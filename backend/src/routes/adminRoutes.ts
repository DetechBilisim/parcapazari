import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
} from "../controllers/adminController.js";

export const adminRoutes = Router();

adminRoutes.use(authenticate, requireRole("ADMIN"));

adminRoutes.get("/pending-users", listPendingUsers);
adminRoutes.post("/users/:userId/approve", approveUser);
adminRoutes.post("/users/:userId/reject", rejectUser);
