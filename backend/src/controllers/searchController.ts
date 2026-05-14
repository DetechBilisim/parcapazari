import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  searchPartsForRetailer,
  searchByOemCode,
  getDistinctBrands,
} from "../services/searchService.js";

export async function searchParts(req: AuthenticatedRequest, res: Response) {
  const { q, brand, category, inStockOnly, currency } = req.query;

  const parts = await searchPartsForRetailer({
    query: typeof q === "string" ? q : undefined,
    brand: typeof brand === "string" ? brand : undefined,
    category: typeof category === "string" ? category : undefined,
    inStockOnly: inStockOnly === "true",
    currency: typeof currency === "string" ? currency : undefined,
  });

  res.json(parts);
}

export async function searchOemCode(req: AuthenticatedRequest, res: Response) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Query parameter 'code' is required" });
  }
  const results = await searchByOemCode(code);
  res.json(results);
}

export async function listBrands(_req: AuthenticatedRequest, res: Response) {
  const brands = await getDistinctBrands();
  res.json(brands);
}