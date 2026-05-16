# Phase 5 — Cart, Checkout & Orders

> **Goal:** Retailers can add parts from multiple wholesalers to a single cart, apply discount codes, and check out. The cart auto-splits into separate orders per wholesaler. Both retailers and wholesalers see their order history. By the end of this phase, the full marketplace transaction loop works end-to-end with a mock payment step.

> **Estimated time:** 4–5 hours
> **Phase outcome:** Functional cart, discount system, mock checkout, and per-role order views. ACME-style business logic vulnerabilities planted.

---

## What's Included in This Phase

1. Database: `Cart`, `CartItem`, `Order`, `OrderItem`, `DiscountCode` models
2. Backend: cart management (add/update/remove items, view cart)
3. Backend: discount code application
4. Backend: checkout endpoint (cart → orders, auto-split per wholesaler)
5. Backend: order history endpoints (retailer + wholesaler views)
6. Backend: order status transitions (wholesaler confirms/ships)
7. Frontend: cart drawer/page
8. Frontend: checkout flow with mock payment
9. Frontend: order history pages for both roles
10. **Deliberate vulnerabilities:** Negative quantity in cart (ACME PT-3), race condition on discount code redemption (ACME PT-4), no stock check on checkout

---

## Step 5.1 — Database Schema

In `backend/prisma/schema.prisma`, add these models below `PartListing`:

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  PAID
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

model Cart {
  id          String      @id @default(cuid())
  retailerId  String      @unique
  retailer    User        @relation("RetailerCart", fields: [retailerId], references: [id], onDelete: Cascade)
  items       CartItem[]
  discountCodeId String?
  discountCode   DiscountCode? @relation(fields: [discountCodeId], references: [id])
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model CartItem {
  id            String      @id @default(cuid())
  cartId        String
  cart          Cart        @relation(fields: [cartId], references: [id], onDelete: Cascade)
  partListingId String
  partListing   PartListing @relation(fields: [partListingId], references: [id], onDelete: Cascade)
  quantity      Int
  unitPrice     Decimal     @db.Decimal(12, 2)
  currency      Currency
  createdAt     DateTime    @default(now())

  @@unique([cartId, partListingId])
  @@index([cartId])
}

model Order {
  id              String      @id @default(cuid())
  orderNumber     String      @unique
  retailerId      String
  retailer        User        @relation("RetailerOrders", fields: [retailerId], references: [id])
  wholesalerId    String
  wholesaler      User        @relation("WholesalerOrders", fields: [wholesalerId], references: [id])
  status          OrderStatus @default(PENDING_PAYMENT)
  subtotal        Decimal     @db.Decimal(12, 2)
  discountAmount  Decimal     @db.Decimal(12, 2) @default(0)
  total           Decimal     @db.Decimal(12, 2)
  currency        Currency
  discountCode    String?
  shippingAddress String?
  notes           String?
  items           OrderItem[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([retailerId])
  @@index([wholesalerId])
  @@index([status])
}

model OrderItem {
  id            String      @id @default(cuid())
  orderId       String
  order         Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  partListingId String
  partListing   PartListing @relation(fields: [partListingId], references: [id])
  partSku       String
  partName      String
  partBrand     String
  quantity      Int
  unitPrice     Decimal     @db.Decimal(12, 2)
  lineTotal     Decimal     @db.Decimal(12, 2)
}

model DiscountCode {
  id              String   @id @default(cuid())
  code            String   @unique
  discountPercent Int
  maxUses         Int
  usedCount       Int      @default(0)
  expiresAt       DateTime?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())

  carts           Cart[]
}
```

Update the `User` model to add the back-references for the new relations:

```prisma
model User {
  // ... existing fields ...

  retailerCart       Cart?    @relation("RetailerCart")
  retailerOrders     Order[]  @relation("RetailerOrders")
  wholesalerOrders   Order[]  @relation("WholesalerOrders")
}
```

Update `PartListing` to add the back-references:

```prisma
model PartListing {
  // ... existing fields ...

  cartItems   CartItem[]
  orderItems  OrderItem[]
}
```

Run the migration:

```bash
cd backend
npx prisma migrate dev --name add_cart_orders_discounts
```

---

## Step 5.2 — Seed Discount Codes

Update **`backend/prisma/seed.ts`** to also seed some sample discount codes. Add this function:

```typescript
async function seedDiscountCodes() {
  const existing = await prisma.discountCode.findFirst();
  if (existing) {
    console.log("Discount codes already seeded, skipping.");
    return;
  }

  await prisma.discountCode.createMany({
    data: [
      {
        code: "HOSGELDIN10",
        discountPercent: 10,
        maxUses: 1000,
      },
      {
        code: "BAYRAM20",
        discountPercent: 20,
        maxUses: 50,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      {
        code: "PARCAPAZAR5",
        discountPercent: 5,
        maxUses: 10000,
      },
    ],
  });

  console.log("✅ Seeded 3 discount codes.");
}
```

Update `main()` to call it:

```typescript
async function main() {
  await seedAdmin();
  await seedParts();
  await seedDiscountCodes();
}
```

Re-run the seed:

```bash
npx prisma db seed
```

---

## Step 5.3 — Cart Service

**`backend/src/services/cartService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";

// Get or create the retailer's cart
async function getOrCreateCart(retailerId: string) {
  let cart = await prisma.cart.findUnique({
    where: { retailerId },
    include: {
      items: {
        include: {
          partListing: {
            include: {
              part: true,
              wholesaler: { select: { id: true, companyName: true } },
            },
          },
        },
      },
      discountCode: true,
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { retailerId },
      include: {
        items: {
          include: {
            partListing: {
              include: {
                part: true,
                wholesaler: { select: { id: true, companyName: true } },
              },
            },
          },
        },
        discountCode: true,
      },
    });
  }

  return cart;
}

export async function getCart(retailerId: string) {
  return getOrCreateCart(retailerId);
}

export async function addToCart(
  retailerId: string,
  partListingId: string,
  quantity: number
) {
  const cart = await getOrCreateCart(retailerId);

  const listing = await prisma.partListing.findUnique({
    where: { id: partListingId },
  });
  if (!listing) throw new Error("Listing not found");

  // Check if item already in cart — if so, update quantity
  const existing = await prisma.cartItem.findUnique({
    where: {
      cartId_partListingId: {
        cartId: cart.id,
        partListingId,
      },
    },
  });

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        partListingId,
        quantity,
        unitPrice: listing.price,
        currency: listing.currency,
      },
    });
  }

  return getCart(retailerId);
}

export async function updateCartItem(
  retailerId: string,
  itemId: string,
  quantity: number
) {
  const cart = await getOrCreateCart(retailerId);

  // Update the quantity directly — flexible for adjustments.
  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });

  return getCart(retailerId);
}

export async function removeFromCart(retailerId: string, itemId: string) {
  await prisma.cartItem.delete({ where: { id: itemId } });
  return getCart(retailerId);
}

export async function clearCart(retailerId: string) {
  const cart = await getOrCreateCart(retailerId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });
  return getCart(retailerId);
}

// Apply discount code to the cart.
// Validates code exists and is active; increments usedCount.
export async function applyDiscountCode(retailerId: string, code: string) {
  const cart = await getOrCreateCart(retailerId);

  const discountCode = await prisma.discountCode.findUnique({
    where: { code },
  });

  if (!discountCode || !discountCode.isActive) {
    throw new Error("İndirim kodu geçersiz");
  }

  if (discountCode.expiresAt && discountCode.expiresAt < new Date()) {
    throw new Error("İndirim kodu süresi dolmuş");
  }

  if (discountCode.usedCount >= discountCode.maxUses) {
    throw new Error("İndirim kodu kullanım limiti dolmuş");
  }

  // Attach to cart
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: discountCode.id },
  });

  // Increment usage count to mark redemption
  await prisma.discountCode.update({
    where: { id: discountCode.id },
    data: { usedCount: discountCode.usedCount + 1 },
  });

  return getCart(retailerId);
}

export async function removeDiscountCode(retailerId: string) {
  const cart = await getOrCreateCart(retailerId);
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });
  return getCart(retailerId);
}
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **No quantity validation in `addToCart` and `updateCartItem`** — negative or zero quantities are accepted. A retailer can send `quantity: -5` which decreases the total. Same class of bug as ACME PT-3.
>
> 2. **Race condition in `applyDiscountCode`** — the `usedCount` check and `usedCount + 1` update happen as separate operations, not in a transaction. Two concurrent requests with the same code can both pass the limit check and both succeed. Same pattern as ACME PT-4.

---

## Step 5.4 — Order Service

**`backend/src/services/orderService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

// Generate a human-readable order number
function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `PP-${timestamp}-${random}`;
}

interface CheckoutInput {
  retailerId: string;
  shippingAddress?: string;
  notes?: string;
}

export async function checkout(input: CheckoutInput) {
  const cart = await prisma.cart.findUnique({
    where: { retailerId: input.retailerId },
    include: {
      items: { include: { partListing: true } },
      discountCode: true,
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new Error("Sepet boş");
  }

  // Group cart items by wholesaler — each becomes a separate order
  const itemsByWholesaler = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const wid = item.partListing.wholesalerId;
    if (!itemsByWholesaler.has(wid)) {
      itemsByWholesaler.set(wid, []);
    }
    itemsByWholesaler.get(wid)!.push(item);
  }

  const discountPercent = cart.discountCode?.discountPercent || 0;
  const createdOrders = [];

  for (const [wholesalerId, items] of itemsByWholesaler.entries()) {
    const subtotal = items.reduce(
      (sum, i) => sum.plus(i.unitPrice.times(i.quantity)),
      new Decimal(0)
    );

    const discountAmount = subtotal.times(discountPercent).dividedBy(100);
    const total = subtotal.minus(discountAmount);

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        retailerId: input.retailerId,
        wholesalerId,
        status: "PAID", // mock payment auto-succeeds
        subtotal,
        discountAmount,
        total,
        currency: items[0].currency,
        discountCode: cart.discountCode?.code,
        shippingAddress: input.shippingAddress,
        notes: input.notes,
        items: {
          create: await Promise.all(
            items.map(async (i) => {
              const listing = await prisma.partListing.findUnique({
                where: { id: i.partListingId },
                include: { part: true },
              });
              return {
                partListingId: i.partListingId,
                partSku: listing!.part.sku,
                partName: listing!.part.name,
                partBrand: listing!.part.brand,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.unitPrice.times(i.quantity),
              };
            })
          ),
        },
      },
      include: { items: true },
    });

    createdOrders.push(order);
  }

  // Clear the cart after successful checkout
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { discountCodeId: null },
  });

  return createdOrders;
}

export async function getRetailerOrders(retailerId: string) {
  return prisma.order.findMany({
    where: { retailerId },
    include: {
      items: true,
      wholesaler: { select: { id: true, companyName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWholesalerOrders(wholesalerId: string) {
  return prisma.order.findMany({
    where: { wholesalerId },
    include: {
      items: true,
      retailer: { select: { id: true, companyName: true, contactPhone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      retailer: { select: { id: true, companyName: true, contactPhone: true, address: true } },
      wholesaler: { select: { id: true, companyName: true } },
    },
  });
}

export async function updateOrderStatus(orderId: string, status: any) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { items: true },
  });
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **No stock validation in `checkout`** — the function does not check whether the requested quantity is available in `PartListing.stock`. A retailer can order 100 items when only 5 are in stock. Combined with negative quantity from Step 5.3, this leads to clear business logic flaws that AI Pentest will surface.

---

## Step 5.5 — Cart Controller

**`backend/src/controllers/cartController.ts`**
```typescript
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  applyDiscountCode,
  removeDiscountCode,
} from "../services/cartService.js";

export async function viewCart(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await getCart(req.user.userId);
  res.json(cart);
}

export async function addItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { partListingId, quantity } = req.body;
    const cart = await addToCart(req.user.userId, partListingId, quantity);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { quantity } = req.body;
    const cart = await updateCartItem(req.user.userId, req.params.itemId, quantity);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function removeItem(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const cart = await removeFromCart(req.user.userId, req.params.itemId);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function clear(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await clearCart(req.user.userId);
  res.json(cart);
}

export async function applyCode(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { code } = req.body;
    const cart = await applyDiscountCode(req.user.userId, code);
    res.json(cart);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function removeCode(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const cart = await removeDiscountCode(req.user.userId);
  res.json(cart);
}
```

---

## Step 5.6 — Order Controller

**`backend/src/controllers/orderController.ts`**
```typescript
import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  checkout,
  getRetailerOrders,
  getWholesalerOrders,
  getOrderById,
  updateOrderStatus,
} from "../services/orderService.js";

export async function performCheckout(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { shippingAddress, notes } = req.body;
    const orders = await checkout({
      retailerId: req.user.userId,
      shippingAddress,
      notes,
    });
    res.status(201).json({ message: "Sipariş oluşturuldu", orders });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function myOrders(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  if (req.user.role === "RETAILER") {
    const orders = await getRetailerOrders(req.user.userId);
    return res.json(orders);
  }
  if (req.user.role === "WHOLESALER") {
    const orders = await getWholesalerOrders(req.user.userId);
    return res.json(orders);
  }
  res.status(403).json({ error: "Forbidden" });
}

export async function orderDetail(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const order = await getOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });
  res.json(order);
}

export async function changeStatus(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { status } = req.body;
    const updated = await updateOrderStatus(req.params.orderId, status);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **IDOR in `orderDetail` and `changeStatus`** — these endpoints don't verify that the order belongs to the authenticated user. Same IDOR pattern as Phase 3 but for a higher-value resource (orders contain pricing, addresses, customer info).

---

## Step 5.7 — Routes

**`backend/src/routes/cartRoutes.ts`**
```typescript
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  viewCart,
  addItem,
  updateItem,
  removeItem,
  clear,
  applyCode,
  removeCode,
} from "../controllers/cartController.js";

export const cartRoutes = Router();

cartRoutes.use(authenticate, requireRole("RETAILER"));

cartRoutes.get("/cart", viewCart);
cartRoutes.post("/cart/items", addItem);
cartRoutes.patch("/cart/items/:itemId", updateItem);
cartRoutes.delete("/cart/items/:itemId", removeItem);
cartRoutes.post("/cart/clear", clear);
cartRoutes.post("/cart/discount", applyCode);
cartRoutes.delete("/cart/discount", removeCode);
```

**`backend/src/routes/orderRoutes.ts`**
```typescript
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware.js";
import {
  performCheckout,
  myOrders,
  orderDetail,
  changeStatus,
} from "../controllers/orderController.js";

export const orderRoutes = Router();

orderRoutes.use(authenticate);

orderRoutes.post("/checkout", requireRole("RETAILER"), performCheckout);
orderRoutes.get("/orders", myOrders);
orderRoutes.get("/orders/:orderId", orderDetail);
orderRoutes.patch("/orders/:orderId/status", requireRole("WHOLESALER", "ADMIN"), changeStatus);
```

Update **`backend/src/app.ts`**:

```typescript
import { cartRoutes } from "./routes/cartRoutes.js";
import { orderRoutes } from "./routes/orderRoutes.js";

// ... after existing routes ...
app.use("/api", cartRoutes);
app.use("/api", orderRoutes);
```

---

## Step 5.8 — Test Backend Endpoints

Make sure backend is running. Login as a retailer with the second wholesaler's listings available.

**Setup:**
1. As retailer, find a PartListing ID by calling `/api/search` and grabbing a listing ID.

**Test 1 — Add item to cart:**
```bash
curl -X POST http://localhost:4000/api/cart/items \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"partListingId": "LISTING_ID", "quantity": 3}'
```

**Test 2 — View cart:**
```bash
curl http://localhost:4000/api/cart \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

**Test 3 — Apply discount code:**
```bash
curl -X POST http://localhost:4000/api/cart/discount \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "HOSGELDIN10"}'
```

**Test 4 — Checkout:**
```bash
curl -X POST http://localhost:4000/api/checkout \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shippingAddress": "İstanbul, Maltepe", "notes": "Acil"}'
```

**Test 5 — View orders (retailer):**
```bash
curl http://localhost:4000/api/orders \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

**Test 6 — View orders (wholesaler):**
```bash
curl http://localhost:4000/api/orders \
  -H "Authorization: Bearer YOUR_WHOLESALER_TOKEN"
```

If all six work, the backend layer is done.

---

## Step 5.9 — Frontend: Cart and Order API Clients

**`frontend/src/api/cart.ts`**
```typescript
import { api } from "../lib/api";

export interface CartItem {
  id: string;
  partListingId: string;
  quantity: number;
  unitPrice: string;
  currency: "TRY" | "EUR" | "USD";
  partListing: {
    id: string;
    stock: number;
    minOrderQty: number;
    part: {
      sku: string;
      name: string;
      brand: string;
    };
    wholesaler: {
      id: string;
      companyName: string;
    };
  };
}

export interface Cart {
  id: string;
  retailerId: string;
  items: CartItem[];
  discountCode: {
    code: string;
    discountPercent: number;
  } | null;
}

export const cartApi = {
  get: async (): Promise<Cart> => {
    const { data } = await api.get("/cart");
    return data;
  },

  addItem: async (partListingId: string, quantity: number): Promise<Cart> => {
    const { data } = await api.post("/cart/items", { partListingId, quantity });
    return data;
  },

  updateItem: async (itemId: string, quantity: number): Promise<Cart> => {
    const { data } = await api.patch(`/cart/items/${itemId}`, { quantity });
    return data;
  },

  removeItem: async (itemId: string): Promise<Cart> => {
    const { data } = await api.delete(`/cart/items/${itemId}`);
    return data;
  },

  clear: async (): Promise<Cart> => {
    const { data } = await api.post("/cart/clear");
    return data;
  },

  applyDiscount: async (code: string): Promise<Cart> => {
    const { data } = await api.post("/cart/discount", { code });
    return data;
  },

  removeDiscount: async (): Promise<Cart> => {
    const { data } = await api.delete("/cart/discount");
    return data;
  },
};
```

**`frontend/src/api/orders.ts`**
```typescript
import { api } from "../lib/api";

export interface OrderItem {
  id: string;
  partSku: string;
  partName: string;
  partBrand: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status:
    | "PENDING_PAYMENT"
    | "PAID"
    | "CONFIRMED"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED";
  subtotal: string;
  discountAmount: string;
  total: string;
  currency: "TRY" | "EUR" | "USD";
  discountCode: string | null;
  shippingAddress: string | null;
  notes: string | null;
  createdAt: string;
  items: OrderItem[];
  retailer?: { id: string; companyName: string; contactPhone: string | null };
  wholesaler?: { id: string; companyName: string };
}

export const ordersApi = {
  checkout: async (shippingAddress: string, notes: string): Promise<Order[]> => {
    const { data } = await api.post("/checkout", { shippingAddress, notes });
    return data.orders;
  },

  myOrders: async (): Promise<Order[]> => {
    const { data } = await api.get("/orders");
    return data;
  },

  getOrder: async (orderId: string): Promise<Order> => {
    const { data } = await api.get(`/orders/${orderId}`);
    return data;
  },

  updateStatus: async (orderId: string, status: Order["status"]): Promise<Order> => {
    const { data } = await api.patch(`/orders/${orderId}/status`, { status });
    return data;
  },
};
```

---

## Step 5.10 — Cart Page

**`frontend/src/pages/CartPage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cartApi, type Cart } from "../api/cart";
import { ordersApi } from "../api/orders";
import { getCurrentUser } from "../lib/auth";

export default function CartPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [cart, setCart] = useState<Cart | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "RETAILER") {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const c = await cartApi.get();
    setCart(c);
  };

  const updateQty = async (itemId: string, qty: number) => {
    await cartApi.updateItem(itemId, qty);
    load();
  };

  const removeItem = async (itemId: string) => {
    await cartApi.removeItem(itemId);
    load();
  };

  const applyDiscount = async () => {
    setError(null);
    try {
      await cartApi.applyDiscount(discountInput);
      setDiscountInput("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "İndirim kodu uygulanamadı");
    }
  };

  const removeDiscount = async () => {
    await cartApi.removeDiscount();
    load();
  };

  const handleCheckout = async () => {
    setError(null);
    try {
      await ordersApi.checkout(shippingAddress, notes);
      setSuccess(true);
      setTimeout(() => navigate("/retailer/orders"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Sipariş oluşturulamadı");
    }
  };

  if (!cart) return null;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-green-700 mb-2">✅ Sipariş oluşturuldu</h1>
          <p className="text-slate-600">Siparişlerim sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  // Group items by wholesaler for visual clarity
  const groupedByWholesaler = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const wid = item.partListing.wholesaler.id;
    if (!groupedByWholesaler.has(wid)) groupedByWholesaler.set(wid, []);
    groupedByWholesaler.get(wid)!.push(item);
  }

  const subtotal = cart.items.reduce(
    (sum, i) => sum + parseFloat(i.unitPrice) * i.quantity,
    0
  );
  const discountPercent = cart.discountCode?.discountPercent || 0;
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = subtotal - discountAmount;
  const currency = cart.items[0]?.currency || "TRY";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Sepetim</h1>
          <button
            onClick={() => navigate("/retailer/search")}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Aramaya dön
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        {cart.items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center">
            <p className="text-slate-500 mb-4">Sepetiniz boş.</p>
            <button
              onClick={() => navigate("/retailer/search")}
              className="bg-slate-900 text-white px-6 py-2 rounded font-medium"
            >
              Parça Aramaya Başla
            </button>
          </div>
        ) : (
          <>
            {Array.from(groupedByWholesaler.entries()).map(([wid, items]) => (
              <div key={wid} className="bg-white rounded-2xl shadow mb-4 overflow-hidden">
                <div className="bg-slate-50 px-5 py-3 border-b">
                  <p className="font-medium">{items[0].partListing.wholesaler.companyName}</p>
                  <p className="text-xs text-slate-500">
                    {items.length} parça · Bu toptancı için ayrı bir sipariş oluşturulacak
                  </p>
                </div>

                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="px-5 py-4 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="font-medium">
                          {item.partListing.part.brand} — {item.partListing.part.name}
                        </p>
                        <p className="text-xs text-slate-500">SKU: {item.partListing.part.sku}</p>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Adet</label>
                        <input
                          type="number"
                          defaultValue={item.quantity}
                          onBlur={(e) => updateQty(item.id, parseInt(e.target.value))}
                          className="w-20 border rounded p-1 text-center"
                        />
                      </div>

                      <div className="text-right w-32">
                        <p className="text-sm text-slate-500">
                          {item.unitPrice} {item.currency} × {item.quantity}
                        </p>
                        <p className="font-bold">
                          {(parseFloat(item.unitPrice) * item.quantity).toFixed(2)} {item.currency}
                        </p>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-bold mb-4">Sipariş Özeti</h2>

              {cart.discountCode ? (
                <div className="flex justify-between items-center bg-green-50 p-3 rounded mb-4">
                  <p className="text-sm">
                    İndirim kodu: <strong>{cart.discountCode.code}</strong> ({cart.discountCode.discountPercent}%)
                  </p>
                  <button onClick={removeDiscount} className="text-red-600 text-sm">Kaldır</button>
                </div>
              ) : (
                <div className="flex gap-2 mb-4">
                  <input
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    placeholder="İndirim kodu"
                    className="flex-1 border rounded p-2"
                  />
                  <button
                    onClick={applyDiscount}
                    className="bg-slate-200 px-4 rounded font-medium"
                  >
                    Uygula
                  </button>
                </div>
              )}

              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Ara toplam</span>
                  <span>{subtotal.toFixed(2)} {currency}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>İndirim ({discountPercent}%)</span>
                    <span>-{discountAmount.toFixed(2)} {currency}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Toplam</span>
                  <span>{total.toFixed(2)} {currency}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Teslimat Adresi</label>
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full border rounded p-2"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notlar</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full border rounded p-2"
                  />
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full bg-slate-900 text-white py-3 rounded font-medium hover:bg-slate-800"
                >
                  Ödemeyi Tamamla ({total.toFixed(2)} {currency})
                </button>
                <p className="text-xs text-slate-500 text-center">
                  Mock ödeme — gerçek ödeme entegrasyonu yok
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Step 5.11 — Orders Page (Both Roles)

**`frontend/src/pages/OrdersPage.tsx`**
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi, type Order } from "../api/orders";
import { getCurrentUser } from "../lib/auth";

const STATUS_LABELS: Record<Order["status"], string> = {
  PENDING_PAYMENT: "Ödeme Bekliyor",
  PAID: "Ödendi",
  CONFIRMED: "Onaylandı",
  SHIPPED: "Kargolandı",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "İptal Edildi",
};

const STATUS_COLORS: Record<Order["status"], string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function OrdersPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    load();
  }, []);

  const load = async () => {
    const data = await ordersApi.myOrders();
    setOrders(data);
  };

  const updateStatus = async (orderId: string, status: Order["status"]) => {
    await ordersApi.updateStatus(orderId, status);
    load();
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/retailer/search");
    else navigate("/wholesaler/listings");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Siparişlerim</h1>
            <p className="text-sm text-slate-500">
              {user.role === "RETAILER" ? "Verdiğim siparişler" : "Aldığım siparişler"}
            </p>
          </div>
          <button onClick={handleBack} className="text-sm text-slate-600 hover:text-slate-900">
            ← Geri
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center text-slate-500">
            Henüz sipariş yok.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="px-5 py-3 border-b flex justify-between items-center bg-slate-50">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(order.createdAt).toLocaleString("tr-TR")} ·{" "}
                      {user.role === "RETAILER"
                        ? order.wholesaler?.companyName
                        : order.retailer?.companyName}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[order.status]}`}
                  >
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div className="px-5 py-3 divide-y">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-2 flex justify-between text-sm">
                      <div>
                        <span className="font-medium">
                          {item.partBrand} — {item.partName}
                        </span>
                        <span className="text-slate-500 ml-2">× {item.quantity}</span>
                      </div>
                      <span>{item.lineTotal} {order.currency}</span>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-3 bg-slate-50 flex justify-between items-center">
                  <div className="text-sm">
                    {parseFloat(order.discountAmount) > 0 && (
                      <span className="text-green-700 mr-3">
                        İndirim: -{order.discountAmount} {order.currency}
                      </span>
                    )}
                    <span className="font-bold">Toplam: {order.total} {order.currency}</span>
                  </div>

                  {user.role === "WHOLESALER" && (
                    <div className="flex gap-2">
                      {order.status === "PAID" && (
                        <button
                          onClick={() => updateStatus(order.id, "CONFIRMED")}
                          className="bg-purple-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Onayla
                        </button>
                      )}
                      {order.status === "CONFIRMED" && (
                        <button
                          onClick={() => updateStatus(order.id, "SHIPPED")}
                          className="bg-indigo-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Kargola
                        </button>
                      )}
                      {order.status === "SHIPPED" && (
                        <button
                          onClick={() => updateStatus(order.id, "DELIVERED")}
                          className="bg-green-600 text-white text-xs px-3 py-1 rounded"
                        >
                          Teslim Edildi
                        </button>
                      )}
                    </div>
                  )}
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

## Step 5.12 — Update Routing and Add to Cart on Search Page

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
import CartPage from "./pages/CartPage";
import OrdersPage from "./pages/OrdersPage";

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
        <Route path="/wholesaler/orders" element={<OrdersPage />} />
        <Route path="/retailer/search" element={<RetailerSearchPage />} />
        <Route path="/retailer/cart" element={<CartPage />} />
        <Route path="/retailer/orders" element={<OrdersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Update `RetailerSearchPage.tsx`** — wire up the "Sepete ekle" button. Find the `<button>` inside `PartCard` and replace its `onClick`:

```typescript
import { cartApi } from "../api/cart";

// inside PartCard component:
const handleAddToCart = async (listingId: string) => {
  await cartApi.addItem(listingId, 1);
  alert("Sepete eklendi ✓");
};

// in the button:
<button
  className="text-xs text-blue-600 hover:underline mt-1"
  onClick={() => handleAddToCart(listing.id)}
>
  Sepete ekle →
</button>
```

Also add a "Sepet" link in the top nav of `RetailerSearchPage`:

```typescript
<button
  onClick={() => navigate("/retailer/cart")}
  className="text-sm text-slate-600 hover:text-slate-900"
>
  Sepet
</button>
<button
  onClick={() => navigate("/retailer/orders")}
  className="text-sm text-slate-600 hover:text-slate-900"
>
  Siparişler
</button>
```

Add a "Siparişler" link to `WholesalerListingsPage` top nav:

```typescript
<button
  onClick={() => navigate("/wholesaler/orders")}
  className="text-sm text-slate-600 hover:text-slate-900"
>
  Siparişler
</button>
```

---

## Step 5.13 — End-to-End Test

1. Login as a retailer (`retailer1@example.com` or similar approved RETAILER).
2. Search for "Bosch" parts.
3. Click "Sepete ekle →" on one of the wholesaler offers.
4. Add another part from a **different wholesaler** to the same cart.
5. Click "Sepet" in the top nav.
6. The cart should show 2 separate wholesaler groups.
7. Try changing quantity on one item — it should update.
8. Enter discount code `HOSGELDIN10` and click Uygula.
9. The summary should show 10% discount applied.
10. Fill in shipping address and notes, click "Ödemeyi Tamamla".
11. You should see "✅ Sipariş oluşturuldu" and redirect to `/retailer/orders`.
12. The orders page should show 2 separate orders (one per wholesaler), both in "Ödendi" status.
13. Logout. Login as the wholesaler that received an order.
14. Click "Siparişler" in the top nav.
15. You should see the incoming order with retailer info.
16. Click "Onayla" → status becomes "Onaylandı".
17. Click "Kargola" → status becomes "Kargolandı".
18. Click "Teslim Edildi" → status becomes "Teslim Edildi".

✅ If all of this works, Phase 5 is complete.

---

## Step 5.14 — Commit

```bash
git add .
git commit -m "feat: phase 5 cart, checkout, and orders"
```

Update `NOTES.md`.

---

## Phase 5 — Verification Checklist

- [ ] Cart, CartItem, Order, OrderItem, DiscountCode tables exist
- [ ] 3 discount codes seeded (`HOSGELDIN10`, `BAYRAM20`, `PARCAPAZAR5`)
- [ ] Retailer can add items to cart from search results
- [ ] Cart shows items grouped by wholesaler
- [ ] Discount code apply works; usedCount increments
- [ ] Checkout creates one Order per wholesaler
- [ ] Cart is cleared after successful checkout
- [ ] Retailer can view their order history
- [ ] Wholesaler can view incoming orders
- [ ] Wholesaler can transition order status (PAID → CONFIRMED → SHIPPED → DELIVERED)
- [ ] Phase 5 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 5

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/services/cartService.ts` `addToCart`, `updateCartItem` | No quantity validation — negative or zero values accepted, leading to negative totals | SAST + AI Pentest (similar to ACME PT-3) |
| 2 | `backend/src/services/cartService.ts` `applyDiscountCode` | Race condition — usedCount check and increment are not atomic, allowing concurrent over-use of single-use codes | AI Pentest (whitebox, similar to ACME PT-4) |
| 3 | `backend/src/services/orderService.ts` `checkout` | No stock validation — order can request more items than available in PartListing.stock | AI Pentest (whitebox) |
| 4 | `backend/src/controllers/orderController.ts` `orderDetail`, `changeStatus` | IDOR — no ownership check on order access or status changes | AI Pentest (whitebox) |

**To exploit the negative quantity (for demo):**

```bash
# Add a part normally
curl -X POST http://localhost:4000/api/cart/items \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"partListingId": "LISTING_ID_A", "quantity": 10}'

# Then add another part with NEGATIVE quantity
curl -X POST http://localhost:4000/api/cart/items \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"partListingId": "LISTING_ID_B", "quantity": -100}'

# View cart — total is now negative or dramatically reduced
curl http://localhost:4000/api/cart -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

This is a textbook business logic flaw. The system "pays" the retailer for ordering goods. ACME PT-3 is the same pattern.

**To exploit the race condition (for demo):**

Pick a discount code that's near its `maxUses` limit (or create one with `maxUses: 1`). Fire two parallel curl requests with the same code from two different retailer sessions:

```bash
# Run these in parallel (e.g. in two terminals simultaneously, or with & in bash)
curl -X POST http://localhost:4000/api/cart/discount \
  -H "Authorization: Bearer TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"code": "BAYRAM20"}' &

curl -X POST http://localhost:4000/api/cart/discount \
  -H "Authorization: Bearer TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"code": "BAYRAM20"}' &
```

Both requests pass the `usedCount < maxUses` check before either of them increments. The code is used twice when it should only be used once. Same race pattern as ACME PT-4.

---

## What Comes Next

**Phase 6 — GraphQL Parts Catalog API:**
- Apollo Server integration alongside Express
- GraphQL schema for parts catalog and search
- Resolvers with filtering, sorting, pagination
- Frontend Apollo Client setup
- Migration of catalog browsing to GraphQL

Deliberate vulnerabilities to come:
- GraphQL introspection enabled in production
- No query depth limiting (DoS via deeply nested queries)
- Alias overloading (resource exhaustion)
- GET requests accepted for GraphQL (CSRF surface)

When you're ready, request `phase-06-graphql.md`.
