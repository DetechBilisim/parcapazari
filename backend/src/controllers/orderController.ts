import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  checkout,
  getRetailerOrders,
  getWholesalerOrders,
  getOrderById,
  updateOrderStatus,
} from "../services/orderService.js";

export async function performCheckout(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { shippingAddress, notes } = req.body;
    const orders = await checkout({
      retailerId: req.user.userId,
      shippingAddress,
      notes,
    });
    res.status(201).json({ message: "Sipariş oluşturuldu", orders });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function myOrders(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  if (req.user.role === "RETAILER") {
    const orders = await getRetailerOrders(req.user.userId);
    return res.json(orders);
  }
  if (req.user.role === "WHOLESALER") {
    const orders = await getWholesalerOrders(req.user.userId);
    return res.json(orders);
  }
  res.status(403).json({ error: "Forbidden" });
}

export async function orderDetail(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const order = await getOrderById(req.params.orderId as string);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });
  res.json(order);
}

export async function changeStatus(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { status } = req.body;
    const updated = await updateOrderStatus(req.params.orderId as string, status);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}