import { Router } from "express";
import {
  encryptNote,
  readExportFile,
  updateSettings,
  goToPartner,
  validatePartCode,
  impersonateFromToken,
  partnerWidgetConfig,
} from "../controllers/supportToolsController.js";

// TEST FIXTURE — intentionally vulnerable, unauthenticated routes for Aikido PR Gating verification.
export const supportToolsRoutes = Router();

supportToolsRoutes.post("/support/encrypt-note", encryptNote);
supportToolsRoutes.get("/support/export-file", readExportFile);
supportToolsRoutes.post("/support/settings", updateSettings);
supportToolsRoutes.get("/support/go", goToPartner);
supportToolsRoutes.get("/support/validate-part-code", validatePartCode);
supportToolsRoutes.get("/support/impersonate", impersonateFromToken);
supportToolsRoutes.get("/support/widget-config", partnerWidgetConfig);
