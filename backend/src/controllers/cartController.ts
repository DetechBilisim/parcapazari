import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyDiscountCode,
  removeDiscountCode,
} from "../services/cartService.js";

export async function viewCart(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await getCart(req.user.userId);
  res.json(cart);
}

export async function addItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { partListingId, quantity } = req.body;
    const cart = await addToCart(req.user.userId, partListingId, quantity);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { quantity } = req.body;
    const cart = await updateCartItem(req.user.userId, req.params.itemId as string, quantity);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function removeItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const cart = await removeFromCart(req.user.userId, req.params.itemId as string);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function clear(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await clearCart(req.user.userId);
  res.json(cart);
}

export async function applyCode(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { code } = req.body;
    const cart = await applyDiscountCode(req.user.userId, code);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function removeCode(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await removeDiscountCode(req.user.userId);
  res.json(cart);
}