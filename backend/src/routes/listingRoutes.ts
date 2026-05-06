import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import { partImageUpload } from "../lib/upload.js";
import { prisma } from "../lib/prisma.js";
import {
  listMyListings,
  createMyListing,
  getListing,
  updateMyListing,
  deleteMyListing,
  searchParts,
  listAllParts,
} from "../controllers/listingController.js";

export const listingRoutes = Router();

listingRoutes.get("/parts", authenticate, listAllParts);
listingRoutes.get("/parts/search", authenticate, searchParts);

listingRoutes.use("/listings", authenticate, requireRole("WHOLESALER"));

listingRoutes.get("/listings", listMyListings);
listingRoutes.post("/listings", createMyListing);
listingRoutes.get("/listings/:listingId", getListing);
listingRoutes.patch("/listings/:listingId", updateMyListing);
listingRoutes.delete("/listings/:listingId", deleteMyListing);

listingRoutes.post(
  "/parts/:partId/image",
  authenticate,
  requireRole("WHOLESALER"),
  partImageUpload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const imageUrl = `/uploads/part-images/${req.file.filename}`;
    const { partId } = req.params;
    await prisma.part.update({
      where: { id: partId as string },
      data: { imageUrl },
    });
    res.json({ imageUrl });
  }
);
