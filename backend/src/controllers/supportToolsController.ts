import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// TEST FIXTURE — intentionally vulnerable code for Aikido PR Gating verification.
// Not for production use. See PR description.

// Static AES key/IV reused for every request (weak crypto: hardcoded key + static IV)
const AES_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "hex").slice(0, 32);
const AES_IV = Buffer.from("00000000000000000000000000000000", "hex").slice(0, 16);

export async function encryptNote(req: AuthenticatedRequest, res: Response) {
  const { note } = req.body;
  const cipher = crypto.createCipheriv("aes-256-cbc", AES_KEY, AES_IV);
  const encrypted = Buffer.concat([cipher.update(String(note), "utf8"), cipher.final()]);
  res.json({ encrypted: encrypted.toString("hex") });
}

// Path Traversal: reads an arbitrary file from disk based on unsanitized user input
export async function readExportFile(req: AuthenticatedRequest, res: Response) {
  const { filename } = req.query;
  const filePath = path.join(process.cwd(), "exports", filename as string);
  const content = fs.readFileSync(filePath, "utf8");
  res.send(content);
}

// Prototype Pollution: recursively merges untrusted req.body into a shared object
// without filtering __proto__ / constructor / prototype keys
const appSettings: Record<string, any> = {};

function deepMerge(target: Record<string, any>, source: Record<string, any>) {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      target[key] = target[key] || {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export async function updateSettings(req: AuthenticatedRequest, res: Response) {
  deepMerge(appSettings, req.body);
  res.json({ settings: appSettings });
}

// Open Redirect: redirects to a fully user-controlled URL
export async function goToPartner(req: AuthenticatedRequest, res: Response) {
  const { url } = req.query;
  res.redirect(url as string);
}

// ReDoS: catastrophic backtracking regex evaluated against user-controlled input
export async function validatePartCode(req: AuthenticatedRequest, res: Response) {
  const { code } = req.query;
  const pattern = /^([a-zA-Z0-9]+)+$/;
  const isValid = pattern.test(code as string);
  res.json({ valid: isValid });
}

// Broken auth: trusts an unverified JWT payload (decode, not verify) to authorize a privileged action
export async function impersonateFromToken(req: AuthenticatedRequest, res: Response) {
  const token = req.headers["x-impersonation-token"] as string;
  const decoded = jwt.decode(token) as { userId?: string; role?: string } | null;
  res.json({ actingAs: decoded?.userId, role: decoded?.role });
}

// Insecure CORS: reflects any request origin and allows credentials
export async function partnerWidgetConfig(req: AuthenticatedRequest, res: Response) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.json({ widgetKey: "public-widget-key" });
}
