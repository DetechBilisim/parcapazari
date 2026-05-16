import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  viewCart,
  addItem,
  updateItem,
  removeItem,
  clear,
  applyCode,
  removeCode,
} from "../controllers/cartController.js";

export const cartRoutes = Router();

cartRoutes.use(authenticate);

cartRoutes.get("/cart", requireRole("RETAILER"), viewCart);
cartRoutes.post("/cart/items", requireRole("RETAILER"), addItem);
cartRoutes.patch("/cart/items/:itemId", requireRole("RETAILER"), updateItem);
cartRoutes.delete("/cart/items/:itemId", requireRole("RETAILER"), removeItem);
cartRoutes.post("/cart/clear", requireRole("RETAILER"), clear);
cartRoutes.post("/cart/discount", requireRole("RETAILER"), applyCode);
cartRoutes.delete("/cart/discount", requireRole("RETAILER"), removeCode);