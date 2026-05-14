# Phase 4 — Search & Price Comparison (Retailer Side)

> **Goal:** Retailers can search the parts catalog by SKU, OEM code, or part name, see all wholesalers offering each part side-by-side with prices and stock, and apply filters (in-stock only, brand, currency). By the end of this phase, the core "marketplace" experience works end-to-end — the retailer's primary use case is functional.

> **Estimated time:** 3–4 hours
> **Phase outcome:** Functional retailer search and price comparison view. User profile management endpoint added.

---

## What's Included in This Phase

1. Backend: search endpoint that returns parts with all their listings grouped
2. Backend: filtering (in-stock, brand, currency)
3. Backend: user profile update endpoint
4. Frontend: retailer search page with filters
5. Frontend: price comparison view (sortable by price)
6. Frontend: user profile page
7. **Deliberate vulnerabilities:** Mass assignment in profile update, no rate limiting on search, OEM code search via raw query

---

## Step 4.1 — Search Service (Catalog with Listings)

The retailer's experience differs from the wholesaler's. They need to:

1. Find the part (by SKU, OEM code, or name)
2. See **all wholesalers** offering it, sorted by price
3. Filter by stock availability, brand, currency

So the search must return parts **with their listings included**.

**`backend/src/services/searchService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";

interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  inStockOnly?: boolean;
  currency?: string;
}

export async function searchPartsForRetailer(filters: SearchFilters) {
  const where: any = {};

  // Text search across SKU, name, brand, OEM codes
  if (filters.query) {
    where.OR = [
      { sku: { contains: filters.query, mode: "insensitive" } },
      { name: { contains: filters.query, mode: "insensitive" } },
      { brand: { contains: filters.query, mode: "insensitive" } },
      { oemCodes: { has: filters.query } },
    ];
  }

  if (filters.brand) {
    where.brand = filters.brand;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  // Get parts with their listings
  const parts = await prisma.part.findMany({
    where,
    include: {
      listings: {
        where: {
          isActive: true,
          ...(filters.inStockOnly ? { stock: { gt: 0 } } : {}),
          ...(filters.currency ? { currency: filters.currency as any } : {}),
        },
        include: {
          wholesaler: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: { price: "asc" },
      },
    },
    orderBy: { brand: "asc" },
  });

  // Filter out parts that have no matching listings
  return parts.filter((p) => p.listings.length > 0);
}

// Search by OEM code with a raw query for "performance reasons"
export async function searchByOemCode(oemCode: string) {
  // The OEM code is interpolated directly for compatibility with PostgreSQL array operators
  const results: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, sku, brand, name, "imageUrl", category, "oemCodes"
     FROM "Part"
     WHERE '${oemCode}' = ANY("oemCodes")
        OR sku ILIKE '%${oemCode}%'
     LIMIT 50`
  );
  return results;
}

// Returns the list of distinct brands available — used for filter dropdown
export async function getDistinctBrands() {
  const brands = await prisma.part.findMany({
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return brands.map((b) => b.brand);
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **`searchByOemCode` uses `$queryRawUnsafe` with string concatenation** — same class of bug as Phase 3, but in a different file and with a different exploit angle. Aikido SAST will flag this independently from the Phase 3 SQL injection.

---

## Step 4.2 — User Profile Service

Retailers (and wholesalers) need to be able to update their profile information. We'll create a single profile update endpoint that both roles use.

**`backend/src/services/userService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";

export async function getProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      address: true,
      createdAt: true,
    },
  });
}

// Update the authenticated user's profile.
// Forwards request body fields directly to Prisma for flexibility.
export async function updateProfile(userId: string, data: any) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      companyName: true,
      taxNumber: true,
      contactPhone: true,
      address: true,
    },
  });
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **Mass assignment in `updateProfile`** — the function accepts `data: any` and forwards it directly to Prisma. A malicious user can send `{ "role": "ADMIN" }` or `{ "status": "ACTIVE" }` and escalate their account. This is a classic privilege escalation pattern.

---

## Step 4.3 — Search Controller

**`backend/src/controllers/searchController.ts`**
```typescript
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  searchPartsForRetailer,
  searchByOemCode,
  getDistinctBrands,
} from "../services/searchService.js";

export async function searchParts(req: AuthenticatedRequest, res: Response) {
  const { q, brand, category, inStockOnly, currency } = req.query;

  const parts = await searchPartsForRetailer({
    query: typeof q === "string" ? q : undefined,
    brand: typeof brand === "string" ? brand : undefined,
    category: typeof category === "string" ? category : undefined,
    inStockOnly: inStockOnly === "true",
    currency: typeof currency === "string" ? currency : undefined,
  });

  res.json(parts);
}

export async function searchOemCode(req: AuthenticatedRequest, res: Response) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Query parameter 'code' is required" });
  }
  const results = await searchByOemCode(code);
  res.json(results);
}

export async function listBrands(_req: AuthenticatedRequest, res: Response) {
  const brands = await getDistinctBrands();
  res.json(brands);
}
```

> ⚠️ **Note:** No rate limiting on these endpoints. A malicious actor (or a competitor scraping the catalog) could hit `/api/search` thousands of times to exfiltrate the entire pricing data. Aikido will flag this as a missing security control.

---

## Step 4.4 — User Controller (Profile Endpoints)

Update **`backend/src/routes/userRoutes.ts`** to add profile read/update:

```typescript
import { Router } from "express";
import { authenticate, type AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { getProfile, updateProfile } from "../services/userService.js";

export const userRoutes = Router();

userRoutes.use(authenticate);

userRoutes.get("/me", async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const profile = await getProfile(req.user.userId);
  res.json(profile);
});

userRoutes.patch("/me", async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const updated = await updateProfile(req.user.userId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

---

## Step 4.5 — Search Routes

**`backend/src/routes/searchRoutes.ts`**
```typescript
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
```

Update **`backend/src/app.ts`** to register the new routes:

```typescript
import { searchRoutes } from "./routes/searchRoutes.js";

// ... after listingRoutes registration ...
app.use("/api", searchRoutes);
```

---

## Step 4.6 — Test Backend Endpoints

You need at least 2 wholesalers with listings on the **same part** to demonstrate price comparison. If you only have one wholesaler from Phase 3, register a second one and approve it.

**Setup data:**

1. Register `wholesaler2@example.com` (Toptancı 2 Ltd.) → admin approves.
2. As wholesaler 1, list "BOSCH-0986452041" at price 850 TRY, stock 25.
3. As wholesaler 2, list the same "BOSCH-0986452041" at price 780 TRY, stock 12.

Now login as a retailer (`retailer1@example.com`, register and approve if needed).

**Test 1 — Search for "Bosch":**

```bash
curl "http://localhost:4000/api/search?q=Bosch" \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

Each part should come with `listings` array showing both wholesalers, sorted by price ascending.

**Test 2 — Search by OEM code:**

```bash
curl "http://localhost:4000/api/search/oem?code=34116794300" \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

Should return the BMW front brake pad.

**Test 3 — List brands:**

```bash
curl http://localhost:4000/api/brands \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

**Test 4 — Filter in-stock + brand:**

```bash
curl "http://localhost:4000/api/search?q=&brand=Bosch&inStockOnly=true" \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

**Test 5 — Get current user profile:**

```bash
curl http://localhost:4000/api/users/me \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

**Test 6 — Update profile (legitimate):**

```bash
curl -X PATCH http://localhost:4000/api/users/me \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contactPhone": "+90 555 222 3344", "address": "İstanbul, Maltepe"}'
```

If all six work, the backend layer is done.

---

## Step 4.7 — Frontend: Search API Client

**`frontend/src/api/search.ts`**
```typescript
import { api } from "../lib/api";
import type { Part } from "./listings";

export interface RetailerListing {
  id: string;
  partId: string;
  wholesalerId: string;
  price: string;
  currency: "TRY" | "EUR" | "USD";
  stock: number;
  minOrderQty: number;
  notes: string | null;
  wholesaler: {
    id: string;
    companyName: string;
  };
}

export interface PartWithListings extends Part {
  listings: RetailerListing[];
}

export interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  inStockOnly?: boolean;
  currency?: "TRY" | "EUR" | "USD";
}

export const searchApi = {
  searchParts: async (filters: SearchFilters): Promise<PartWithListings[]> => {
    const params: Record<string, string> = {};
    if (filters.query) params.q = filters.query;
    if (filters.brand) params.brand = filters.brand;
    if (filters.category) params.category = filters.category;
    if (filters.inStockOnly) params.inStockOnly = "true";
    if (filters.currency) params.currency = filters.currency;

    const { data } = await api.get("/search", { params });
    return data;
  },

  searchByOem: async (code: string): Promise<Part[]> => {
    const { data } = await api.get("/search/oem", { params: { code } });
    return data;
  },

  getBrands: async (): Promise<string[]> => {
    const { data } = await api.get("/brands");
    return data;
  },
};
```

---

## Step 4.8 — Frontend: User Profile API

**`frontend/src/api/users.ts`**
```typescript
import { api } from "../lib/api";

export interface UserProfile {
  id: string;
  email: string;
  role: "WHOLESALER" | "RETAILER" | "ADMIN";
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED";
  companyName: string;
  taxNumber: string;
  contactPhone: string | null;
  address: string | null;
}

export const usersApi = {
  getMe: async (): Promise<UserProfile> => {
    const { data } = await api.get("/users/me");
    return data;
  },

  updateMe: async (input: Partial<{
    companyName: string;
    contactPhone: string;
    address: string;
  }>): Promise<UserProfile> => {
    const { data } = await api.patch("/users/me", input);
    return data;
  },
};
```

---

## Step 4.9 — Retailer Search Page

**`frontend/src/pages/RetailerSearchPage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchApi, type PartWithListings, type SearchFilters } from "../api/search";
import { getCurrentUser, logout } from "../lib/auth";

const CATEGORIES = [
  { value: "", label: "Tüm Kategoriler" },
  { value: "BRAKES", label: "Fren Sistemi" },
  { value: "ENGINE", label: "Motor" },
  { value: "SUSPENSION", label: "Süspansiyon" },
  { value: "ELECTRICAL", label: "Elektrik" },
  { value: "TRANSMISSION", label: "Şanzıman" },
  { value: "EXHAUST", label: "Egzoz" },
  { value: "COOLING", label: "Soğutma" },
  { value: "FILTERS", label: "Filtreler" },
  { value: "BODY", label: "Kaporta" },
  { value: "INTERIOR", label: "İç Döşeme" },
  { value: "OTHER", label: "Diğer" },
];

export default function RetailerSearchPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [results, setResults] = useState<PartWithListings[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    brand: "",
    category: "",
    inStockOnly: true,
  });

  useEffect(() => {
    if (!user || user.role !== "RETAILER") {
      navigate("/login");
      return;
    }
    loadBrands();
    runSearch();
  }, []);

  const loadBrands = async () => {
    const list = await searchApi.getBrands();
    setBrands(list);
  };

  const runSearch = async () => {
    setLoading(true);
    try {
      const data = await searchApi.searchParts(filters);
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">{user.companyName}</h1>
            <p className="text-sm text-slate-500">Perakendeci Paneli — Parça Arama</p>
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => navigate("/profile")}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Profil
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Çıkış
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SKU, OEM kodu veya isim ile ara
            </label>
            <input
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder="Örn: BOSCH-0986452041, fren balatası, 34116794300"
              className="w-full border rounded p-2"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Marka</label>
              <select
                value={filters.brand}
                onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
                className="w-full border rounded p-2"
              >
                <option value="">Tüm Markalar</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full border rounded p-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Para Birimi</label>
              <select
                value={filters.currency || ""}
                onChange={(e) => setFilters({ ...filters, currency: e.target.value as any })}
                className="w-full border rounded p-2"
              >
                <option value="">Tümü</option>
                <option value="TRY">TRY</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => setFilters({ ...filters, inStockOnly: e.target.checked })}
              />
              Sadece stoktakiler
            </label>

            <button
              type="submit"
              className="bg-slate-900 text-white px-6 py-2 rounded font-medium hover:bg-slate-800"
            >
              {loading ? "Aranıyor..." : "Ara"}
            </button>
          </div>
        </form>

        <div className="mb-3 text-sm text-slate-500">
          {results.length} parça bulundu
        </div>

        {results.length === 0 ? (
          <p className="text-slate-500 text-center py-12 bg-white rounded-2xl shadow">
            Aramanızla eşleşen parça bulunamadı.
          </p>
        ) : (
          <div className="space-y-4">
            {results.map((part) => (
              <PartCard key={part.id} part={part} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PartCard({ part }: { part: PartWithListings }) {
  const cheapest = part.listings[0];
  const totalStock = part.listings.reduce((sum, l) => sum + l.stock, 0);

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <div className="p-5 border-b">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-bold text-lg">{part.brand} — {part.name}</h3>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">SKU: {part.sku}</span>
            </div>
            <p className="text-sm text-slate-600">
              {part.vehicleMakes.join(", ")} · {part.vehicleModels.slice(0, 2).join(", ")}
              {part.vehicleModels.length > 2 && ` (+${part.vehicleModels.length - 2})`}
            </p>
            {part.oemCodes.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                OEM: {part.oemCodes.join(", ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">En düşük fiyat</p>
            <p className="font-bold text-2xl text-green-700">
              {cheapest.price} {cheapest.currency}
            </p>
            <p className="text-xs text-slate-500 mt-1">Toplam stok: {totalStock}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase px-5 py-2 bg-slate-50">
          {part.listings.length} Toptancı
        </p>
        <div className="divide-y">
          {part.listings.map((listing) => (
            <div key={listing.id} className="px-5 py-3 flex justify-between items-center hover:bg-slate-50">
              <div>
                <p className="font-medium">{listing.wholesaler.companyName}</p>
                <p className="text-xs text-slate-500">
                  Min. sipariş: {listing.minOrderQty} adet · Stok: {listing.stock}
                </p>
                {listing.notes && (
                  <p className="text-xs text-slate-600 mt-0.5">📝 {listing.notes}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">
                  {listing.price} {listing.currency}
                </p>
                <button
                  className="text-xs text-blue-600 hover:underline mt-1"
                  onClick={() => alert("Sepet özelliği Phase 5'te eklenecek")}
                >
                  Sepete ekle →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Step 4.10 — Profile Page

**`frontend/src/pages/ProfilePage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usersApi, type UserProfile } from "../api/users";
import { getCurrentUser } from "../lib/auth";

export default function ProfilePage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    contactPhone: "",
    address: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const p = await usersApi.getMe();
    setProfile(p);
    setForm({
      companyName: p.companyName,
      contactPhone: p.contactPhone || "",
      address: p.address || "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await usersApi.updateMe(form);
      setSaved(true);
      load();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Güncelleme başarısız");
    }
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/retailer/search");
    else if (user?.role === "WHOLESALER") navigate("/wholesaler/listings");
    else navigate("/admin");
  };

  if (!profile) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={handleBack}
          className="text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          ← Geri
        </button>

        <h1 className="text-2xl font-bold mb-6">Profil Bilgileri</h1>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
        {saved && <div className="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm">✅ Kaydedildi</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p className="text-slate-500">E-posta</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-slate-500">Vergi Numarası</p>
              <p className="font-medium">{profile.taxNumber}</p>
            </div>
            <div>
              <p className="text-slate-500">Rol</p>
              <p className="font-medium">
                {profile.role === "WHOLESALER" ? "Toptancı" :
                 profile.role === "RETAILER" ? "Perakendeci" : "Admin"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Durum</p>
              <p className="font-medium">
                {profile.status === "ACTIVE" ? "Aktif" :
                 profile.status === "PENDING_APPROVAL" ? "Onay bekliyor" : "Askıya alındı"}
              </p>
            </div>
          </div>

          <hr className="my-4" />

          <label className="block text-sm font-medium text-slate-700 mb-1">Şirket Adı</label>
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className="w-full border rounded p-2 mb-4"
            required
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">İletişim Telefonu</label>
          <input
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            className="w-full border rounded p-2 mb-4"
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">Adres</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full border rounded p-2 mb-4"
            rows={3}
          />

          <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded font-medium">
            Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Step 4.11 — Update Routing

**`frontend/src/App.tsx`** — add the new routes:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import WholesalerListingsPage from "./pages/WholesalerListingsPage";
import RetailerSearchPage from "./pages/RetailerSearchPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/wholesaler/listings" element={<WholesalerListingsPage />} />
        <Route path="/retailer/search" element={<RetailerSearchPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

Update **`frontend/src/pages/DashboardPage.tsx`** — add retailer auto-redirect to the existing useEffect:

```typescript
useEffect(() => {
  if (user?.role === "WHOLESALER" && user.status === "ACTIVE") {
    navigate("/wholesaler/listings");
  } else if (user?.role === "RETAILER" && user.status === "ACTIVE") {
    navigate("/retailer/search");
  }
}, [user, navigate]);
```

---

## Step 4.12 — End-to-End Test

1. Make sure you have at least 2 wholesalers with listings on the same part (see Step 4.6 setup).
2. Login as a retailer.
3. You should auto-redirect to `/retailer/search`.
4. The page should load with brands populated and an initial set of search results.
5. Type "Bosch" in the search box, click Ara.
6. Results should show parts with their wholesaler offers, sorted by price.
7. Each part card should show "X Toptancı" and list each wholesaler with their price.
8. The cheapest price should be highlighted at the top right of each part card.
9. Toggle "Sadece stoktakiler" off — out-of-stock listings should appear if any exist.
10. Filter by brand "Bosch" — only Bosch parts should show.
11. Try OEM search via curl: `?code=34116794300` should return the BMW brake pad.
12. Click "Profil" in the top-right.
13. Update phone number, click Kaydet — green confirmation should appear.
14. Reload the page — the new phone number should persist.

✅ If all of this works, Phase 4 is complete.

---

## Step 4.13 — Commit

```bash
git add .
git commit -m "feat: phase 4 retailer search and price comparison"
```

Update `NOTES.md`.

---

## Phase 4 — Verification Checklist

- [ ] Search endpoint returns parts grouped with their listings, sorted by price
- [ ] OEM code search works
- [ ] Brand list endpoint returns distinct brands
- [ ] Filters work (in-stock only, brand, category, currency)
- [ ] Profile read endpoint returns user data
- [ ] Profile update endpoint accepts changes
- [ ] Frontend retailer search page loads after retailer login
- [ ] Frontend search results show price comparison correctly
- [ ] Frontend profile page allows updates
- [ ] Phase 4 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 4

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/services/searchService.ts` `searchByOemCode` | SQL injection via `$queryRawUnsafe` with string concatenation in OEM code search | SAST + AI Pentest |
| 2 | `backend/src/services/userService.ts` `updateProfile` | Mass assignment — accepts arbitrary fields including `role` and `status`, enabling privilege escalation | SAST + AI Pentest (whitebox) |
| 3 | `backend/src/routes/searchRoutes.ts` | No rate limiting on search endpoint — enables catalog scraping and DoS | AI Pentest + DAST |

**To exploit the mass assignment for privilege escalation (for demo):**

Login as a regular retailer, then:

```bash
curl -X PATCH http://localhost:4000/api/users/me \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "ADMIN"}'
```

The user's role is now ADMIN. Login again with that retailer's email — they can now access `/api/admin/pending-users` and approve any user. Classic privilege escalation. Aikido AI Pentest in whitebox mode catches this immediately by reading the controller code.

**To exploit the OEM SQL injection:**

```bash
curl "http://localhost:4000/api/search/oem?code=%27%29%20OR%201%3D1%20--" \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

Returns the entire parts table.

---

## What Comes Next

**Phase 5 — Cart, Checkout & Orders:**
- Multi-wholesaler cart (auto-splits into separate orders)
- Discount code system
- Mock payment flow
- Order history (retailer + wholesaler views)

Deliberate vulnerabilities to come:
- Negative quantity in cart leading to negative totals (ACME PT-3)
- Race condition in discount code redemption (ACME PT-4)

When you're ready, request `phase-05-cart-checkout.md`.
