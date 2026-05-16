import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  performCheckout,
  myOrders,
  orderDetail,
  changeStatus,
} from "../controllers/orderController.js";

export const orderRoutes = Router();

orderRoutes.use(authenticate);

orderRoutes.post("/checkout", requireRole("RETAILER"), performCheckout);
orderRoutes.get("/orders", myOrders);
orderRoutes.get("/orders/:orderId", orderDetail);
orderRoutes.patch("/orders/:orderId/status", requireRole("WHOLESALER", "ADMIN"), changeStatus);