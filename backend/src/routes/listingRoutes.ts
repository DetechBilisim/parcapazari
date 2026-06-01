import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import { partImageMemoryUpload } from "../lib/upload.js";
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
import { uploadToS3 } from "../lib/s3.js";
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
  partImageMemoryUpload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const key = `part-images/${Date.now()}-${req.file.originalname}`;
    const imageUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);
   
    await prisma.part.update({
      where: { id: req.params.partId as string },
      data: { imageUrl },
    });
    res.json({ imageUrl });
  }
);
