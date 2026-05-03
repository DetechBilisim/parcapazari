# Phase 2 — Authentication & User Management

> **Goal:** Build user registration, login, role-based access (wholesaler / retailer / admin), JWT-based authentication, and admin approval flow. By the end of this phase, users can register, log in, see their role-specific dashboard, and admins can approve pending company accounts.

> **Estimated time:** 3–4 hours
> **Phase outcome:** Working auth flow with JWT. First deliberate vulnerabilities introduced.

---

## What's Included in This Phase

1. User database model + Prisma migration
2. Registration endpoint (with role selection)
3. Login endpoint (JWT generation)
4. JWT middleware (route protection)
5. Role-based access control middleware
6. Password reset flow
7. Admin approval flow for company accounts
8. Frontend: registration page, login page, basic role-based dashboard
9. **First deliberate vulnerabilities** (4 of them — listed at the end)

---

## Step 2.1 — Database Schema (User Model)

In `backend/prisma/schema.prisma`, replace the placeholder with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  WHOLESALER
  RETAILER
  ADMIN
}

enum UserStatus {
  PENDING_APPROVAL
  ACTIVE
  SUSPENDED
}

model User {
  id                String      @id @default(cuid())
  email             String      @unique
  passwordHash      String
  role              UserRole
  status            UserStatus  @default(PENDING_APPROVAL)
  companyName       String
  taxNumber         String      @unique
  contactPhone      String?
  address           String?
  passwordResetToken String?
  passwordResetExpiresAt DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}
```

Run the first migration:

```bash
cd backend
npx prisma migrate dev --name init_user
```

This creates the `User` table in PostgreSQL and generates the Prisma client. You should see a new folder under `prisma/migrations/` and a confirmation that the migration was applied.

Verify it worked:

```bash
docker exec -it parcapazar-postgres psql -U parcapazar -d parcapazar_dev -c "\dt"
```

You should see `User` and `_prisma_migrations` tables listed.

---

## Step 2.2 — Install Auth Dependencies

```bash
npm install bcrypt jsonwebtoken
npm install -D @types/bcrypt @types/jsonwebtoken
```

---

## Step 2.3 — Prisma Client Singleton

**`backend/src/lib/prisma.ts`**
```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

This pattern ensures we don't create multiple Prisma client instances during development.

---

## Step 2.4 — Auth Configuration

**`backend/src/lib/authConfig.ts`**
```typescript
// JWT secret used to sign and verify tokens.
// In production this should come from environment variables.
export const JWT_SECRET = "parcapazar_super_secret_2026";
export const JWT_EXPIRES_IN = "7d";

export const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;
```

> ⚠️ **Note:** The hardcoded JWT secret here is **deliberate**. This is one of our planted vulnerabilities. Aikido SAST and Secrets Detection will both flag this. Don't fix it.

---

## Step 2.5 — Auth Service

**`backend/src/services/authService.ts`**
```typescript
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
```

> ⚠️ **Deliberate vulnerabilities planted in this file:**
> 1. **Password reset token disclosure** — `requestPasswordReset` returns the raw token in the response (line 73). In production this should only be sent via email.
> 2. **Password reset bypass** — `resetPassword` (line 90) accepts a request without a token and proceeds with the reset. The token is only checked *if provided*. This is a classic ACME PT-2-style bug.
> 3. **Weak password policy** — `registerUser` does not validate password strength. A user can register with the password `"a"`.
>
> Aikido SAST and AI Pentest will both catch these.

---

## Step 2.6 — Auth Middleware

**`backend/src/middleware/authMiddleware.ts`**
```typescript
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/authConfig.js";
import type { UserRole } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: UserRole;
    email: string;
  };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedRequest["user"];
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
```

---

## Step 2.7 — Auth Controller

**`backend/src/controllers/authController.ts`**
```typescript
import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
} from "../services/authService.js";

export async function register(req: Request, res: Response) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({
      message: "Registration successful. Awaiting admin approval.",
      user,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);
    res.json({
      message: "If the email exists, a reset link has been sent.",
      token: result.token,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function passwordReset(req: Request, res: Response) {
  try {
    const { email, newPassword, token } = req.body;
    const result = await resetPassword(email, newPassword, token);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
```

---

## Step 2.8 — Admin Controller

**`backend/src/controllers/adminController.ts`**
```typescript
import type { Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export async function listPendingUsers(_req: AuthenticatedRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { status: "PENDING_APPROVAL" },
    select: {
      id: true,
      email: true,
      role: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      createdAt: true,
    },
  });
  res.json(users);
}

export async function approveUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });
  res.json({ message: "User approved", user });
}

export async function rejectUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  await prisma.user.delete({ where: { id: userId } });
  res.json({ message: "User rejected and removed" });
}
```

---

## Step 2.9 — Routes

**`backend/src/routes/authRoutes.ts`**
```typescript
import { Router } from "express";
import {
  register,
  login,
  forgotPassword,
  passwordReset,
} from "../controllers/authController.js";

export const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/forgot-password", forgotPassword);
authRoutes.post("/password-reset", passwordReset);
```

**`backend/src/routes/adminRoutes.ts`**
```typescript
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
} from "../controllers/adminController.js";

export const adminRoutes = Router();

adminRoutes.use(authenticate, requireRole("ADMIN"));

adminRoutes.get("/pending-users", listPendingUsers);
adminRoutes.post("/users/:userId/approve", approveUser);
adminRoutes.post("/users/:userId/reject", rejectUser);
```

**`backend/src/routes/userRoutes.ts`** (for current user info)
```typescript
import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { prisma } from "../lib/prisma.js";

export const userRoutes = Router();

userRoutes.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      createdAt: true,
    },
  });

  res.json(user);
});
```

Update **`backend/src/app.ts`**:

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { authRoutes } from "./routes/authRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";

dotenv.config();

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "parcapazar-backend",
    message: "Hello from ParçaPazar 🔧",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
```

---

## Step 2.10 — Seed an Initial Admin

**`backend/prisma/seed.ts`**
```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@parcapazar.com" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("admin2026", 10);

  await prisma.user.create({
    data: {
      email: "admin@parcapazar.com",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      companyName: "ParçaPazar Platform",
      taxNumber: "0000000000",
    },
  });

  console.log("✅ Admin seeded: admin@parcapazar.com / admin2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

> ⚠️ **Deliberate vulnerability:** Hardcoded admin credentials seeded into production-style seed file. Same pattern as ACME PT-1.

Add to **`backend/package.json`**:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Run the seed:

```bash
npx prisma db seed
```

You should see: `✅ Admin seeded: admin@parcapazar.com / admin2026`

---

## Step 2.11 — Test the Backend Endpoints

Start the backend if it's not already running:

```bash
npm run dev
```

In another terminal, test with curl:

**Register a wholesaler:**
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "wholesaler1@example.com",
    "password": "test123",
    "role": "WHOLESALER",
    "companyName": "Mehmet Oto Yedek Parça Ltd.",
    "taxNumber": "1234567890",
    "contactPhone": "+90 555 111 2233"
  }'
```

**Login as admin:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@parcapazar.com", "password": "admin2026"}'
```

Save the returned `token`. Then:

**List pending users:**
```bash
curl http://localhost:4000/api/admin/pending-users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE"
```

**Approve the wholesaler:**
```bash
curl -X POST http://localhost:4000/api/admin/users/USER_ID_HERE/approve \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE"
```

**Login as wholesaler now:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "wholesaler1@example.com", "password": "test123"}'
```

If all four steps work, the auth flow is functional.

---

## Step 2.12 — Frontend: Auth Context and API Client

**`frontend/src/lib/api.ts`**
```typescript
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("parcapazar_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**`frontend/src/lib/auth.ts`**
```typescript
import { api } from "./api";

export interface User {
  id: string;
  email: string;
  role: "WHOLESALER" | "RETAILER" | "ADMIN";
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED";
  companyName: string;
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  localStorage.setItem("parcapazar_token", data.token);
  localStorage.setItem("parcapazar_user", JSON.stringify(data.user));
  return data.user as User;
}

export async function register(input: {
  email: string;
  password: string;
  role: "WHOLESALER" | "RETAILER";
  companyName: string;
  taxNumber: string;
  contactPhone?: string;
}) {
  const { data } = await api.post("/auth/register", input);
  return data;
}

export function logout() {
  localStorage.removeItem("parcapazar_token");
  localStorage.removeItem("parcapazar_user");
}

export function getCurrentUser(): User | null {
  const stored = localStorage.getItem("parcapazar_user");
  return stored ? JSON.parse(stored) : null;
}
```

---

## Step 2.13 — Frontend Pages

**`frontend/src/pages/LoginPage.tsx`**
```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const user = await login(email, password);
      if (user.role === "ADMIN") navigate("/admin");
      else navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Giriş başarısız");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Giriş Yap</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded font-medium hover:bg-slate-800"
        >
          Giriş Yap
        </button>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Hesabın yok mu?{" "}
          <a href="/register" className="text-blue-600 hover:underline">Kayıt ol</a>
        </p>
      </form>
    </div>
  );
}
```

**`frontend/src/pages/RegisterPage.tsx`**
```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../lib/auth";

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "RETAILER" as "WHOLESALER" | "RETAILER",
    companyName: "",
    taxNumber: "",
    contactPhone: "",
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register(form);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Kayıt başarısız");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-green-700 mb-2">✅ Kayıt başarılı</h1>
          <p className="text-slate-600">Hesabınız admin onayını bekliyor. Yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Kayıt Ol</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

        <label className="block text-sm font-medium text-slate-700 mb-1">Hesap Tipi</label>
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as any })}
          className="w-full border rounded p-2 mb-4"
        >
          <option value="RETAILER">Perakendeci</option>
          <option value="WHOLESALER">Toptancı</option>
        </select>

        <label className="block text-sm font-medium text-slate-700 mb-1">Şirket Adı</label>
        <input
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Vergi Numarası</label>
        <input
          value={form.taxNumber}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">İletişim Telefonu</label>
        <input
          value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          className="w-full border rounded p-2 mb-4"
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">E-posta</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <label className="block text-sm font-medium text-slate-700 mb-1">Şifre</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full border rounded p-2 mb-4"
          required
        />

        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded font-medium hover:bg-slate-800"
        >
          Kayıt Ol
        </button>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Zaten hesabın var mı?{" "}
          <a href="/login" className="text-blue-600 hover:underline">Giriş yap</a>
        </p>
      </form>
    </div>
  );
}
```

**`frontend/src/pages/DashboardPage.tsx`** (basic placeholder)
```typescript
import { getCurrentUser, logout } from "../lib/auth";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Hoş geldin, {user.companyName}</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Çıkış
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-sm text-slate-500 mb-2">Rol</p>
          <p className="font-medium mb-4">
            {user.role === "WHOLESALER" ? "Toptancı" : user.role === "RETAILER" ? "Perakendeci" : "Admin"}
          </p>

          <p className="text-sm text-slate-500 mb-2">Durum</p>
          <p className="font-medium">
            {user.status === "ACTIVE" ? "✅ Aktif" :
             user.status === "PENDING_APPROVAL" ? "⏳ Onay bekliyor" : "🚫 Askıya alındı"}
          </p>
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 p-4 rounded text-sm text-yellow-800">
          Phase 3'te bu sayfa role'üne göre genişletilecek (toptancı: parça katalog yönetimi, perakendeci: arama).
        </div>
      </div>
    </div>
  );
}
```

**`frontend/src/pages/AdminPage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { logout } from "../lib/auth";
import { useNavigate } from "react-router-dom";

interface PendingUser {
  id: string;
  email: string;
  role: string;
  companyName: string;
  taxNumber: string;
  contactPhone?: string;
  createdAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await api.get("/admin/pending-users");
    setUsers(data);
  };

  useEffect(() => { load(); }, []);

  const approve = async (userId: string) => {
    await api.post(`/admin/users/${userId}/approve`);
    load();
  };

  const reject = async (userId: string) => {
    await api.post(`/admin/users/${userId}/reject`);
    load();
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin Paneli — Onay Bekleyen Hesaplar</h1>
          <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900">
            Çıkış
          </button>
        </div>

        {users.length === 0 ? (
          <p className="text-slate-500">Onay bekleyen hesap yok.</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="bg-white rounded-2xl shadow p-5 flex justify-between items-center">
                <div>
                  <p className="font-medium">{u.companyName}</p>
                  <p className="text-sm text-slate-500">
                    {u.email} · {u.role === "WHOLESALER" ? "Toptancı" : "Perakendeci"} · Vergi No: {u.taxNumber}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(u.id)}
                    className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => reject(u.id)}
                    className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-red-700"
                  >
                    Reddet
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Step 2.14 — Routing

**`frontend/src/App.tsx`** (replace existing content)
```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Step 2.15 — End-to-End Test

Restart backend if needed (`npm run dev` in `backend/`), and run frontend (`npm run dev` in `frontend/`).

In the browser:

1. Visit `http://localhost:5173/register`
2. Register as a wholesaler with company name "Test Toptancı Ltd."
3. Should see "✅ Kayıt başarılı" → redirected to login
4. Try logging in → should fail because account is pending approval (or succeed but show "Onay bekliyor" status)
5. Visit `/login`, log in as admin (`admin@parcapazar.com` / `admin2026`)
6. Should land on `/admin` showing the pending wholesaler
7. Click **Onayla**
8. Logout, log back in as the wholesaler → status should now be "Aktif"

If all of this works, Phase 2 is complete. ✅

---

## Step 2.16 — Commit

From project root:

```bash
git add .
git commit -m "feat: phase 2 authentication and user management"
```

Update `NOTES.md` with date and any issues you ran into.

---

## Phase 2 — Verification Checklist

- [ ] User registration works for both WHOLESALER and RETAILER roles
- [ ] Email/tax number duplicate check returns 400 error
- [ ] Login returns JWT token
- [ ] Authenticated `/api/users/me` endpoint returns current user
- [ ] Admin can list pending users
- [ ] Admin can approve a pending user → status becomes ACTIVE
- [ ] Frontend register page works
- [ ] Frontend login page works
- [ ] Frontend dashboard shows user info correctly
- [ ] Frontend admin page lists pending users and approve/reject works
- [ ] All Phase 2 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 2

For demo storytelling, here's what's planted (do NOT fix any of these):

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/lib/authConfig.ts` | Hardcoded JWT secret (`parcapazar_super_secret_2026`) | SAST + Secrets Detection |
| 2 | `backend/src/services/authService.ts` `requestPasswordReset` | Reset token returned in API response | SAST + AI Pentest |
| 3 | `backend/src/services/authService.ts` `resetPassword` | Token validation only happens *if* token is provided — request without token still works | AI Pentest (similar to ACME PT-2) |
| 4 | `backend/src/services/authService.ts` `registerUser` | No password strength validation — accepts any password including 1-character | SAST |
| 5 | `backend/prisma/seed.ts` | Hardcoded admin credentials in seed file (`admin@parcapazar.com` / `admin2026`) | SAST + AI Pentest (similar to ACME PT-1) |

When demoing, these will all show up clearly in the Aikido dashboard, and you can walk the customer through each one — explaining how Aikido caught what a developer wrote in a hurry.

---

## What Comes Next

**Phase 3 — Parts Catalog & Listings (Wholesaler Side):**
- Wholesaler can add parts to catalog (SKU, OEM code, brand, price, stock, image)
- Image upload to S3 (mock for now, real S3 in Phase 9)
- Parts CRUD API
- Frontend: wholesaler dashboard with parts management

Deliberate vulnerabilities to come:
- SQL injection via raw query in part search
- IDOR (wholesaler reads another wholesaler's parts)
- Mass assignment in part update endpoint

When you're ready, request `phase-03-parts-catalog.md`.
