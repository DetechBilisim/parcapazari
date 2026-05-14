import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  searchParts,
  searchOemCode,
  listBrands,
} from "../controllers/searchController.js";

export const searchRoutes = Router();

// Retailers and admins can search. Wholesalers go through their own listing management.
searchRoutes.use(authenticate, requireRole("RETAILER", "ADMIN"));

searchRoutes.get("/search", searchParts);
searchRoutes.get("/search/oem", searchOemCode);
searchRoutes.get("/brands", listBrands);