import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  createListing,
  getMyListings,
  getListingById,
  updateListing,
  deleteListing,
  searchPartsBySkuOrName,
} from "../services/listingService.js";
import { prisma } from "../lib/prisma.js";

export async function listMyListings(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const listings = await getMyListings(req.user.userId);
  res.json(listings);
}

export async function createMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const listing = await createListing({
      ...req.body,
      wholesalerId: req.user.userId,
    });
    res.status(201).json(listing);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getListing(req: AuthenticatedRequest, res: Response) {
  const { listingId } = req.params;
  const listing = await getListingById(listingId as string);
  if (!listing) return res.status(404).json({ error: "Not found" });
  res.json(listing);
}

export async function updateMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const { listingId } = req.params;
  try {
    const updated = await updateListing(listingId as string, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const { listingId } = req.params;
  try {
    await deleteListing(listingId as string);
    res.json({ message: "Listing deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function searchParts(req: AuthenticatedRequest, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q : null;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const parts = await searchPartsBySkuOrName(q);
  res.json(parts);
}

export async function listAllParts(_req: AuthenticatedRequest, res: Response) {
  const parts = await prisma.part.findMany({ orderBy: { brand: "asc" } });
  res.json(parts);
}
