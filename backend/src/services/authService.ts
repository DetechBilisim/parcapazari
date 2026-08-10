import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET, JWT_EXPIRES_IN, PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "../lib/authConfig.js";
import type { UserRole } from "@prisma/client";

interface RegisterInput {
  email: string;
  password: string;
  role?: UserRole; // Optional - will be validated and restricted
  companyName: string;
  taxNumber: string;
  contactPhone?: string;
}

export async function registerUser(input: RegisterInput) {
  // Check if email or tax number already exists
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: input.email },
        { taxNumber: input.taxNumber },
      ],
    },
  });

  if (existing) {
    throw new Error("Email or tax number already registered");
  }

  // Security: Restrict public registration to non-admin roles only
  // ADMIN role can only be assigned by existing admins through separate admin endpoints
  let assignedRole: UserRole;
  if (input.role === "WHOLESALER" || input.role === "RETAILER") {
    assignedRole = input.role;
  } else {
    // Default to RETAILER if role is missing, invalid, or ADMIN
    assignedRole = "RETAILER";
  }

  // Hash password (10 salt rounds — fast for dev)
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: assignedRole,
      companyName: input.companyName,
      taxNumber: input.taxNumber,
      contactPhone: input.contactPhone,
    },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    companyName: user.companyName,
  };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new Error("Invalid credentials");
  }

  // Security: Only allow ACTIVE users to log in
  // PENDING_APPROVAL users must wait for admin approval
  // SUSPENDED users are explicitly blocked
  if (user.status === "SUSPENDED") {
    throw new Error("Account suspended");
  }

  if (user.status === "PENDING_APPROVAL") {
    throw new Error("Account pending approval. Please wait for admin approval.");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      companyName: user.companyName,
    },
  };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { token: null };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    },
  });

  // In production this would be sent via email.
  // Returning it directly is fine for dev/testing.
  return { token };
}

export async function resetPassword(email: string, newPassword: string, token?: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error("User not found");
  }

  // If a token is provided, validate it. If not, proceed anyway.
  if (token && user.passwordResetToken && user.passwordResetToken !== token) {
    throw new Error("Invalid token");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });

  return { success: true };
}
