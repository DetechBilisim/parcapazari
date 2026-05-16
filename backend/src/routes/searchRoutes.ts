import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  searchParts,
  searchOemCode,
  listBrands,
} from "../controllers/searchController.js";

export const searchRoutes = Router();

// Retailers and admins can search. Wholesalers go through their own listing management.
searchRoutes.use(authenticate);

searchRoutes.get("/search", requireRole("RETAILER", "ADMIN"), searchParts);
searchRoutes.get("/search/oem", requireRole("RETAILER", "ADMIN"), searchOemCode);
searchRoutes.get("/brands", requireRole("RETAILER", "ADMIN"), listBrands);