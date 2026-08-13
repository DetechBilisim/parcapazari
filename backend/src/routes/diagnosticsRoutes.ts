import { Router } from "express";
import {
  diagnosticsLookupUser,
  diagnosticsPing,
  diagnosticsFetchUrl,
  diagnosticsEvalExpression,
  diagnosticsIssueResetToken,
} from "../controllers/diagnosticsController.js";

// TEST FIXTURE — intentionally vulnerable, unauthenticated routes for Aikido PR Gating verification.
export const diagnosticsRoutes = Router();

diagnosticsRoutes.get("/diagnostics/user", diagnosticsLookupUser);
diagnosticsRoutes.get("/diagnostics/ping", diagnosticsPing);
diagnosticsRoutes.get("/diagnostics/fetch", diagnosticsFetchUrl);
diagnosticsRoutes.post("/diagnostics/eval", diagnosticsEvalExpression);
diagnosticsRoutes.post("/diagnostics/reset-token", diagnosticsIssueResetToken);
