import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET, JWT_EXPIRES_IN, PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "../lib/authConfig.js";
import type { UserRole } from "@prisma/client";

interface RegisterInput {
  email: string;
  password: string;
  role: UserRole;
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

  // Hash password (10 salt rounds — fast for dev)
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
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

  if (user.status === "SUSPENDED") {
    throw new Error("Account suspended");
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

  // Token is mandatory for password reset
  if (!token) {
    throw new Error("Reset token is required");
  }

  // Validate that a reset token exists for this user
  if (!user.passwordResetToken) {
    throw new Error("No password reset requested for this account");
  }

  // Validate token matches
  if (user.passwordResetToken !== token) {
    throw new Error("Invalid or expired reset token");
  }

  // Validate token has not expired
  if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new Error("Invalid or expired reset token");
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
