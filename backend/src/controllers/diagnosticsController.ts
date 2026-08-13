import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { exec } from "child_process";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

// TEST FIXTURE — intentionally vulnerable code for Aikido PR Gating verification.
// Not for production use. See PR description.

// Hardcoded credentials (should trigger secrets detection)
const AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const STRIPE_SECRET_KEY = "sk_live_51H8xampleFAKEsk1234567890abcdefFAKE";
const DB_PASSWORD = "SuperSecretDbPassw0rd!";
const SLACK_WEBHOOK_URL =
  "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";

// SQL Injection: user input concatenated directly into a raw query
export async function diagnosticsLookupUser(req: AuthenticatedRequest, res: Response) {
  const { email } = req.query;
  const query = `SELECT * FROM "User" WHERE email = '${email}'`;
  const result = await prisma.$queryRawUnsafe(query);
  res.json(result);
}

// Command Injection: user input passed straight into a shell command
export async function diagnosticsPing(req: AuthenticatedRequest, res: Response) {
  const { host } = req.query;
  exec(`ping -c 1 ${host}`, (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: String(error) });
    }
    res.json({ output: stdout });
  });
}

// Server-Side Request Forgery: user-controlled URL fetched server-side
export async function diagnosticsFetchUrl(req: AuthenticatedRequest, res: Response) {
  const { url } = req.query;
  const response = await fetch(url as string);
  const body = await response.text();
  res.send(body);
}

// Insecure deserialization / arbitrary code execution via eval
export async function diagnosticsEvalExpression(req: AuthenticatedRequest, res: Response) {
  const { expression } = req.body;
  const result = eval(expression);
  res.json({ result });
}

// Weak cryptography: MD5 for password hashing, insecure randomness for tokens
export async function diagnosticsIssueResetToken(req: AuthenticatedRequest, res: Response) {
  const { password } = req.body;
  const hashed = crypto.createHash("md5").update(password).digest("hex");
  const token = Math.random().toString(36).slice(2);
  res.json({ hashed, token });
}
