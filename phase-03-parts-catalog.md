# Phase 3 — Parts Catalog & Listings (Wholesaler Side)

> **Goal:** Wholesalers can add automotive parts to the platform catalog, set their own price/stock for each part, and manage their listings. By the end of this phase, you'll have a working catalog with realistic automotive part data, and wholesalers can perform full CRUD on their listings.

> **Estimated time:** 3–4 hours
> **Phase outcome:** Functional parts catalog with two-tier model (Part + PartListing). Wholesalers can manage their inventory.

---

## What's Included in This Phase

1. Database schema: `Part` and `PartListing` models
2. Initial parts catalog seed (realistic automotive data)
3. Wholesaler endpoints: list/add/update/delete listings
4. Part image upload (mock filesystem for now — S3 comes in Phase 9)
5. Frontend: wholesaler parts management page
6. **Deliberate vulnerabilities:** SQL injection via raw query, IDOR, mass assignment

---

## Step 3.1 — Understand the Two-Tier Data Model

Before writing code, understand the model:

- **`Part`** = the catalog entry for a unique automotive part (e.g., "Bosch brake pads, SKU 0986452041, OEM 34116794300")
  - Shared across all wholesalers — the platform owns this catalog
  - Identified by SKU (Stock Keeping Unit, manufacturer's code)
  - Carries description, brand, category, image, OEM cross-reference codes

- **`PartListing`** = a specific wholesaler's offer for a specific Part
  - One Part can have many PartListings (e.g., 3 wholesalers offer the same Bosch brake pad at different prices)
  - Carries price, stock, minimum order quantity, currency

This is **why the platform exists**: a retailer searches by SKU, sees all wholesalers offering that exact part, and picks the cheapest.

---

## Step 3.2 — Database Schema

In `backend/prisma/schema.prisma`, add these models below the `User` model:

```prisma
enum PartCategory {
  BRAKES
  ENGINE
  SUSPENSION
  ELECTRICAL
  TRANSMISSION
  EXHAUST
  COOLING
  FILTERS
  BODY
  INTERIOR
  OTHER
}

enum Currency {
  TRY
  EUR
  USD
}

model Part {
  id             String        @id @default(cuid())
  sku            String        @unique
  oemCodes       String[]
  brand          String
  name           String
  description    String?
  category       PartCategory
  imageUrl       String?
  vehicleMakes   String[]
  vehicleModels  String[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  listings       PartListing[]
}

model PartListing {
  id              String      @id @default(cuid())
  partId          String
  wholesalerId    String
  price           Decimal     @db.Decimal(12, 2)
  currency        Currency    @default(TRY)
  stock           Int
  minOrderQty     Int         @default(1)
  isActive        Boolean     @default(true)
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  part            Part        @relation(fields: [partId], references: [id], onDelete: Cascade)
  wholesaler      User        @relation(fields: [wholesalerId], references: [id], onDelete: Cascade)

  @@unique([partId, wholesalerId])
  @@index([partId])
  @@index([wholesalerId])
}
```

You also need to add the back-reference from `User` to `PartListing`. Find your `User` model and add this relation field:

```prisma
model User {
  // ... existing fields ...

  partListings   PartListing[]
}
```

Run the migration:

```bash
cd backend
npx prisma migrate dev --name add_parts_and_listings
```

You should see the migration applied and the Prisma client regenerated.

---

## Step 3.3 — Seed Realistic Parts Catalog

Update **`backend/prisma/seed.ts`** to also seed an initial parts catalog. Replace the existing `main()` function:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function seedAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@parcapazar.com" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping.");
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

  console.log("✅ Admin seeded.");
}

async function seedParts() {
  const existingPart = await prisma.part.findFirst();
  if (existingPart) {
    console.log("Parts already seeded, skipping.");
    return;
  }

  const parts = [
    {
      sku: "BOSCH-0986452041",
      oemCodes: ["34116794300", "34116798825"],
      brand: "Bosch",
      name: "Ön Fren Balatası",
      description: "BMW 3 serisi için ön fren balatası seti, dört parça.",
      category: "BRAKES" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["320i E90", "320d E90", "325i E90"],
    },
    {
      sku: "MAHLE-OX371D",
      oemCodes: ["A2701800009", "2701800009"],
      brand: "Mahle",
      name: "Yağ Filtresi",
      description: "Mercedes M271 motor için yağ filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Mercedes-Benz"],
      vehicleModels: ["C180 W204", "C200 W204", "E200 W212"],
    },
    {
      sku: "NGK-IFR6T-11",
      oemCodes: ["90919-01210", "9091901210"],
      brand: "NGK",
      name: "İridyum Buji",
      description: "Toyota Corolla için iridyum buji seti.",
      category: "ENGINE" as const,
      vehicleMakes: ["Toyota"],
      vehicleModels: ["Corolla 1.6 VVT-i", "Avensis 1.8"],
    },
    {
      sku: "VALEO-563214",
      oemCodes: ["8200063988", "7700428656"],
      brand: "Valeo",
      name: "Debriyaj Seti",
      description: "Renault Megane 1.5 dCi için komple debriyaj seti.",
      category: "TRANSMISSION" as const,
      vehicleMakes: ["Renault"],
      vehicleModels: ["Megane II 1.5 dCi", "Scenic II 1.5 dCi"],
    },
    {
      sku: "SACHS-3000950726",
      oemCodes: ["06A141031M"],
      brand: "Sachs",
      name: "Volant",
      description: "VW Golf 5 1.9 TDI için çift kütleli volant.",
      category: "TRANSMISSION" as const,
      vehicleMakes: ["Volkswagen"],
      vehicleModels: ["Golf V 1.9 TDI", "Passat B6 1.9 TDI"],
    },
    {
      sku: "MANN-W7008",
      oemCodes: ["045115561B"],
      brand: "Mann Filter",
      name: "Yağ Filtresi",
      description: "VW Polo 1.4 TDI için yağ filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Volkswagen", "Skoda", "Seat"],
      vehicleModels: ["Polo 1.4 TDI", "Fabia 1.4 TDI", "Ibiza 1.4 TDI"],
    },
    {
      sku: "FEBI-22557",
      oemCodes: ["31336752735"],
      brand: "Febi Bilstein",
      name: "Ön Amortisör Yastığı",
      description: "BMW 5 serisi için ön amortisör yastığı.",
      category: "SUSPENSION" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["520i E60", "525i E60", "530i E60"],
    },
    {
      sku: "BOSCH-F026407123",
      oemCodes: ["1109AY", "1109Z2"],
      brand: "Bosch",
      name: "Yakıt Filtresi",
      description: "Peugeot 308 1.6 HDi için yakıt filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Peugeot", "Citroen"],
      vehicleModels: ["308 1.6 HDi", "C4 1.6 HDi"],
    },
    {
      sku: "DELPHI-LP1832",
      oemCodes: ["34116771868"],
      brand: "Delphi",
      name: "Ön Fren Balatası",
      description: "BMW X3 F25 için ön fren balatası seti.",
      category: "BRAKES" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["X3 F25 xDrive20d", "X3 F25 xDrive30d"],
    },
    {
      sku: "BOSCH-0258017025",
      oemCodes: ["06A906262BR"],
      brand: "Bosch",
      name: "Lambda Sensörü",
      description: "VW/Audi 1.8T için lambda (oksijen) sensörü.",
      category: "ELECTRICAL" as const,
      vehicleMakes: ["Volkswagen", "Audi"],
      vehicleModels: ["Passat B6 1.8 TSI", "A4 B7 1.8T"],
    },
  ];

  await prisma.part.createMany({ data: parts });
  console.log(`✅ Seeded ${parts.length} parts to catalog.`);
}

async function main() {
  await seedAdmin();
  await seedParts();
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

Re-run the seed:

```bash
npx prisma db seed
```

Expected output:
```
Admin already exists, skipping.
✅ Seeded 10 parts to catalog.
```

Verify in DB:

```bash
docker exec -it parcapazar-postgres psql -U parcapazar -d parcapazar_dev -c "SELECT sku, brand, name FROM \"Part\" LIMIT 5;"
```

---

## Step 3.4 — Set Up File Upload (Local Filesystem for Now)

Install multer:

```bash
npm install multer
npm install -D @types/multer
```

**`backend/src/lib/upload.ts`**
```typescript
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "part-images");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

export const partImageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
```

> ℹ️ **Note:** No MIME type validation here. Phase 7 (messaging) will add deliberate path traversal in attachment download. For now we leave the upload itself permissive — Aikido will flag the missing validation.

Add to `.gitignore` (project root):

```
backend/uploads/
```

Update **`backend/src/app.ts`** to serve uploaded files:

```typescript
import path from "path";
// ... existing imports ...

// Add after express.json() middleware:
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
```

---

## Step 3.5 — Listing Service

**`backend/src/services/listingService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";
import type { Currency } from "@prisma/client";

interface CreateListingInput {
  partId: string;
  wholesalerId: string;
  price: number;
  currency?: Currency;
  stock: number;
  minOrderQty?: number;
  notes?: string;
}

export async function createListing(input: CreateListingInput) {
  return prisma.partListing.create({
    data: {
      partId: input.partId,
      wholesalerId: input.wholesalerId,
      price: input.price,
      currency: input.currency || "TRY",
      stock: input.stock,
      minOrderQty: input.minOrderQty || 1,
      notes: input.notes,
    },
    include: {
      part: true,
    },
  });
}

export async function getMyListings(wholesalerId: string) {
  return prisma.partListing.findMany({
    where: { wholesalerId },
    include: { part: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListingById(listingId: string) {
  return prisma.partListing.findUnique({
    where: { id: listingId },
    include: { part: true, wholesaler: { select: { id: true, companyName: true } } },
  });
}

// NOTE: Updates use spread to apply whatever fields the client sends.
// This is faster than typing each field explicitly.
export async function updateListing(listingId: string, data: any) {
  return prisma.partListing.update({
    where: { id: listingId },
    data,
    include: { part: true },
  });
}

export async function deleteListing(listingId: string) {
  return prisma.partListing.delete({ where: { id: listingId } });
}

// Search across all parts using a raw SQL query for better performance.
// The search term is interpolated directly into the query string.
export async function searchPartsBySkuOrName(searchTerm: string) {
  const results = await prisma.$queryRawUnsafe(
    `SELECT id, sku, brand, name, "imageUrl", category
     FROM "Part"
     WHERE sku ILIKE '%${searchTerm}%' OR name ILIKE '%${searchTerm}%'
     LIMIT 50`
  );
  return results;
}
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **SQL injection in `searchPartsBySkuOrName`** — using `$queryRawUnsafe` with string concatenation. A search term like `' OR 1=1 --` will dump the entire catalog. Aikido SAST catches this immediately.
>
> 2. **Mass assignment in `updateListing`** — the `data: any` parameter forwards whatever the client sends directly to Prisma. A client could send `{ wholesalerId: "<other_user_id>" }` and transfer the listing to another wholesaler.

---

## Step 3.6 — Listing Controller

**`backend/src/controllers/listingController.ts`**
```typescript
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  createListing,
  getMyListings,
  getListingById,
  updateListing,
  deleteListing,
  searchPartsBySkuOrName,
} from "../services/listingService.js";
import { prisma } from "../lib/prisma.js";

export async function listMyListings(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const listings = await getMyListings(req.user.userId);
  res.json(listings);
}

export async function createMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const listing = await createListing({
      ...req.body,
      wholesalerId: req.user.userId,
    });
    res.status(201).json(listing);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function getListing(req: AuthenticatedRequest, res: Response) {
  const listing = await getListingById(req.params.listingId);
  if (!listing) return res.status(404).json({ error: "Not found" });
  res.json(listing);
}

export async function updateMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const updated = await updateListing(req.params.listingId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteMyListing(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    await deleteListing(req.params.listingId);
    res.json({ message: "Listing deleted" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function searchParts(req: AuthenticatedRequest, res: Response) {
  const { q } = req.query;
  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  const parts = await searchPartsBySkuOrName(q);
  res.json(parts);
}

export async function listAllParts(_req: AuthenticatedRequest, res: Response) {
  const parts = await prisma.part.findMany({ orderBy: { brand: "asc" } });
  res.json(parts);
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **IDOR in `getListing`, `updateMyListing`, `deleteMyListing`** — the controller does not check whether the listing belongs to the authenticated wholesaler. Any authenticated wholesaler can read, update, or delete another wholesaler's listing if they know the listing ID. Aikido AI Pentest catches this in whitebox mode.

---

## Step 3.7 — Routes

**`backend/src/routes/listingRoutes.ts`**
```typescript
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import { partImageUpload } from "../lib/upload.js";
import { prisma } from "../lib/prisma.js";
import {
  listMyListings,
  createMyListing,
  getListing,
  updateMyListing,
  deleteMyListing,
  searchParts,
  listAllParts,
} from "../controllers/listingController.js";

export const listingRoutes = Router();

// Any authenticated user can browse the catalog (Phase 4 will tighten this).
listingRoutes.get("/parts", authenticate, listAllParts);
listingRoutes.get("/parts/search", authenticate, searchParts);

// Wholesaler-only listing endpoints
listingRoutes.use("/listings", authenticate, requireRole("WHOLESALER"));

listingRoutes.get("/listings", listMyListings);
listingRoutes.post("/listings", createMyListing);
listingRoutes.get("/listings/:listingId", getListing);
listingRoutes.patch("/listings/:listingId", updateMyListing);
listingRoutes.delete("/listings/:listingId", deleteMyListing);

// Image upload — returns the public URL.
listingRoutes.post(
  "/parts/:partId/image",
  authenticate,
  requireRole("WHOLESALER"),
  partImageUpload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const imageUrl = `/uploads/part-images/${req.file.filename}`;
    await prisma.part.update({
      where: { id: req.params.partId },
      data: { imageUrl },
    });
    res.json({ imageUrl });
  }
);
```

Update **`backend/src/app.ts`**:

```typescript
import { listingRoutes } from "./routes/listingRoutes.js";

// ... after other route registrations ...
app.use("/api", listingRoutes);
```

---

## Step 3.8 — Test Backend Endpoints

Make sure backend is running (`npm run dev` in `backend/`).

**Step 1: Login as the wholesaler from Phase 2 (must be ACTIVE).**

If you don't have one approved, register a wholesaler and approve them via admin first.

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "wholesaler1@example.com", "password": "test123"}'
```

Save the token.

**Step 2: List the catalog parts.**

```bash
curl http://localhost:4000/api/parts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

You should see the 10 seeded parts.

**Step 3: Search.**

```bash
curl "http://localhost:4000/api/parts/search?q=Bosch" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Step 4: Create a listing.**

Pick a `partId` from the list response (any cuid string), then:

```bash
curl -X POST http://localhost:4000/api/listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "partId": "PASTE_PART_ID_HERE",
    "price": 850.00,
    "currency": "TRY",
    "stock": 25,
    "minOrderQty": 1,
    "notes": "Stoktan teslim"
  }'
```

**Step 5: List your own listings.**

```bash
curl http://localhost:4000/api/listings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

If all four work, the backend layer is done.

---

## Step 3.9 — Frontend: Wholesaler Listings Page

**`frontend/src/api/listings.ts`**
```typescript
import { api } from "../lib/api";

export interface Part {
  id: string;
  sku: string;
  oemCodes: string[];
  brand: string;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  vehicleMakes: string[];
  vehicleModels: string[];
}

export interface PartListing {
  id: string;
  partId: string;
  wholesalerId: string;
  price: string;
  currency: "TRY" | "EUR" | "USD";
  stock: number;
  minOrderQty: number;
  isActive: boolean;
  notes: string | null;
  part: Part;
}

export const listingsApi = {
  getCatalog: async (): Promise<Part[]> => {
    const { data } = await api.get("/parts");
    return data;
  },

  searchCatalog: async (query: string): Promise<Part[]> => {
    const { data } = await api.get("/parts/search", { params: { q: query } });
    return data;
  },

  getMyListings: async (): Promise<PartListing[]> => {
    const { data } = await api.get("/listings");
    return data;
  },

  createListing: async (input: {
    partId: string;
    price: number;
    currency: "TRY" | "EUR" | "USD";
    stock: number;
    minOrderQty?: number;
    notes?: string;
  }): Promise<PartListing> => {
    const { data } = await api.post("/listings", input);
    return data;
  },

  updateListing: async (
    listingId: string,
    input: Partial<{
      price: number;
      currency: "TRY" | "EUR" | "USD";
      stock: number;
      minOrderQty: number;
      isActive: boolean;
      notes: string;
    }>
  ): Promise<PartListing> => {
    const { data } = await api.patch(`/listings/${listingId}`, input);
    return data;
  },

  deleteListing: async (listingId: string): Promise<void> => {
    await api.delete(`/listings/${listingId}`);
  },
};
```

**`frontend/src/pages/WholesalerListingsPage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listingsApi, type Part, type PartListing } from "../api/listings";
import { getCurrentUser, logout } from "../lib/auth";

export default function WholesalerListingsPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [listings, setListings] = useState<PartListing[]>([]);
  const [catalog, setCatalog] = useState<Part[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    partId: "",
    price: 0,
    currency: "TRY" as "TRY" | "EUR" | "USD",
    stock: 0,
    minOrderQty: 1,
    notes: "",
  });

  useEffect(() => {
    if (!user || user.role !== "WHOLESALER") {
      navigate("/login");
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [myListings, catalogParts] = await Promise.all([
        listingsApi.getMyListings(),
        listingsApi.getCatalog(),
      ]);
      setListings(myListings);
      setCatalog(catalogParts);
    } catch (err: any) {
      setError(err.response?.data?.error || "Veriler yüklenemedi");
    }
  };

  const handleSearch = async () => {
    if (!searchTerm) {
      const all = await listingsApi.getCatalog();
      setCatalog(all);
      return;
    }
    const results = await listingsApi.searchCatalog(searchTerm);
    setCatalog(results);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await listingsApi.createListing(form);
      setShowAddForm(false);
      setForm({ partId: "", price: 0, currency: "TRY", stock: 0, minOrderQty: 1, notes: "" });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || "Liste oluşturulamadı");
    }
  };

  const handleDelete = async (listingId: string) => {
    if (!confirm("Bu listeyi silmek istediğinizden emin misiniz?")) return;
    await listingsApi.deleteListing(listingId);
    loadData();
  };

  const handleStockUpdate = async (listingId: string, newStock: number) => {
    await listingsApi.updateListing(listingId, { stock: newStock });
    loadData();
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
            <p className="text-sm text-slate-500">Toptancı Paneli — Parça Listeleri</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-600 hover:text-slate-900">
            Çıkış
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Listelerim ({listings.length})</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-slate-900 text-white px-4 py-2 rounded font-medium hover:bg-slate-800"
          >
            {showAddForm ? "İptal" : "+ Yeni Liste"}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-6 mb-6">
            <h3 className="font-bold mb-4">Yeni Parça Listesi Ekle</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Parça Ara</label>
              <div className="flex gap-2">
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="SKU veya isim ile ara..."
                  className="flex-1 border rounded p-2"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="bg-slate-200 px-4 rounded font-medium"
                >
                  Ara
                </button>
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1">Parça Seç</label>
            <select
              value={form.partId}
              onChange={(e) => setForm({ ...form, partId: e.target.value })}
              className="w-full border rounded p-2 mb-4"
              required
            >
              <option value="">-- Bir parça seçin --</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} — {p.name} (SKU: {p.sku})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fiyat</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Para Birimi</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value as any })}
                  className="w-full border rounded p-2"
                >
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stok</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) })}
                  className="w-full border rounded p-2"
                  required
                />
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1">Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border rounded p-2 mb-4"
              rows={2}
            />

            <button type="submit" className="bg-slate-900 text-white px-6 py-2 rounded font-medium">
              Kaydet
            </button>
          </form>
        )}

        {listings.length === 0 ? (
          <p className="text-slate-500 text-center py-8 bg-white rounded-2xl shadow">
            Henüz hiç listeniz yok. Yukarıdan "Yeni Liste" butonuyla başlayabilirsiniz.
          </p>
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl shadow p-5 flex justify-between items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-medium">{l.part.brand} — {l.part.name}</p>
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                      SKU: {l.part.sku}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {l.part.vehicleMakes.join(", ")} · {l.part.category}
                  </p>
                  {l.notes && (
                    <p className="text-xs text-slate-600 mt-1">📝 {l.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-lg">{l.price} {l.currency}</p>
                    <p className="text-xs text-slate-500">Min. sipariş: {l.minOrderQty}</p>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Stok</label>
                    <input
                      type="number"
                      defaultValue={l.stock}
                      onBlur={(e) => handleStockUpdate(l.id, parseInt(e.target.value))}
                      className="w-20 border rounded p-1 text-center"
                    />
                  </div>

                  <button
                    onClick={() => handleDelete(l.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Sil
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

## Step 3.10 — Update Routing

**`frontend/src/App.tsx`** — add the new route:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import WholesalerListingsPage from "./pages/WholesalerListingsPage";

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
      </Routes>
    </BrowserRouter>
  );
}
```

Update **`frontend/src/pages/DashboardPage.tsx`** — make wholesalers redirect to their listings page automatically. Add `useEffect` to imports and include this hook in the component:

```typescript
import { useEffect } from "react";

// inside DashboardPage component:
useEffect(() => {
  if (user?.role === "WHOLESALER" && user.status === "ACTIVE") {
    navigate("/wholesaler/listings");
  }
}, [user, navigate]);
```

---

## Step 3.11 — End-to-End Test

1. Start backend (`npm run dev` in `backend/`) and frontend (`npm run dev` in `frontend/`).
2. Login as an approved wholesaler.
3. You should auto-redirect to `/wholesaler/listings`.
4. Click "+ Yeni Liste".
5. In the search field, type "Bosch", click Ara.
6. The dropdown should filter to Bosch parts.
7. Select a part, enter price (e.g. 850), stock (e.g. 25), and click Kaydet.
8. The new listing should appear below.
9. Try editing stock inline (change number, click outside the field).
10. Try deleting a listing.
11. Logout, login as a different wholesaler, verify they don't see the first wholesaler's listings.

✅ If all of this works, Phase 3 is complete.

---

## Step 3.12 — Commit

```bash
git add .
git commit -m "feat: phase 3 parts catalog and wholesaler listings"
```

Update `NOTES.md`.

---

## Phase 3 — Verification Checklist

- [ ] Database migrations applied (`Part`, `PartListing` tables exist)
- [ ] 10 parts seeded successfully
- [ ] Wholesaler can list catalog parts via API
- [ ] Wholesaler can search parts via API (with seeded SKUs like "BOSCH-0986452041")
- [ ] Wholesaler can create a listing via API
- [ ] Wholesaler can list their own listings via API
- [ ] Wholesaler can update a listing via API
- [ ] Wholesaler can delete a listing via API
- [ ] Frontend wholesaler page loads and shows catalog
- [ ] Frontend can create, edit, delete listings
- [ ] Phase 3 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 3

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/services/listingService.ts` `searchPartsBySkuOrName` | SQL injection via `$queryRawUnsafe` with string concatenation | SAST + AI Pentest |
| 2 | `backend/src/services/listingService.ts` `updateListing` | Mass assignment via `data: any` parameter | SAST + AI Pentest (whitebox) |
| 3 | `backend/src/controllers/listingController.ts` `getListing`, `updateMyListing`, `deleteMyListing` | IDOR — no ownership check on listing access/modification | AI Pentest (whitebox) |

**To exploit the SQL injection manually (for demo):**

```bash
curl "http://localhost:4000/api/parts/search?q=%25%27%20OR%201%3D1%20--" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This dumps parts that wouldn't normally be returned. In a real query with sensitive data this would be a critical breach.

---

## What Comes Next

**Phase 4 — Search & Price Comparison (Retailer Side):**
- Retailer can search by SKU or OEM code
- Multi-wholesaler price comparison view
- Filtering (in-stock only, currency, brand)
- Frontend retailer search page

Deliberate vulnerabilities to come:
- Mass assignment in user profile update
- No rate limiting on the search endpoint (DoS / scraping vector)

When you're ready, request `phase-04-search-comparison.md`.
