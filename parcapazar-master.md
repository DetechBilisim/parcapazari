# ParçaPazar — Master Setup Document

> **Project codename:** ParçaPazar
> **Purpose:** Aikido demo environment — full-stack B2B automotive parts marketplace
> **Stack:** Node.js + Express + GraphQL + React + PostgreSQL + Prisma
> **Deployment target:** AWS Free Tier (EC2 + RDS + S3)
> **CI/CD:** GitHub + GitHub Actions

---

## 1. Project Goal

ParçaPazar is a B2B marketplace connecting automotive parts wholesalers with retailers. Wholesalers list parts (with SKU, OEM codes, pricing, stock); retailers search by SKU and order from the cheapest available wholesaler.

**The real goal:** Build a realistic, full-stack application that exercises every Aikido module — SAST, SCA, Secrets, IaC, Container, CSPM, DAST, AI Pentest, Zen Runtime Protection — so the dashboard fills with meaningful findings during customer demos.

---

## 2. Actors and Roles

| Role | Capabilities |
|------|--------------|
| **Wholesaler** (Toptancı) | Manage parts catalog, view incoming orders, manage stock, message retailers |
| **Retailer** (Perakendeci) | Search parts by SKU/OEM, compare prices across wholesalers, place orders, message wholesalers |
| **Admin** | Approve wholesaler accounts (tax number verification), manage platform settings, view metrics |

---

## 3. Core User Flows

### Wholesaler flow
1. Register → email verification → tax number submission → admin approval
2. Add parts to catalog (manual or bulk via future CSV)
3. Receive orders → confirm → mark as shipped
4. Message retailer about order

### Retailer flow
1. Register → email verification → tax number submission → admin approval
2. Search by SKU (e.g., "BOSCH 0986452041") or OEM code
3. View all wholesalers offering that part — sorted by price
4. Add to cart (multi-wholesaler cart auto-splits into separate orders)
5. Apply discount code → checkout (mock payment)
6. Track order, message wholesaler

### Admin flow
1. Review pending wholesaler/retailer registrations
2. Verify tax numbers
3. Approve/reject
4. View platform-wide metrics

---

## 4. Technical Architecture

```
┌─────────────────┐         ┌─────────────────┐
│  React Frontend │────────▶│ Express Backend │
│  (Vite + TW)    │  REST   │   + GraphQL     │
└─────────────────┘         └────────┬────────┘
                                     │
                            ┌────────▼────────┐
                            │   PostgreSQL    │
                            │  (via Prisma)   │
                            └─────────────────┘

                            ┌─────────────────┐
                            │   AWS S3        │
                            │  (part images)  │
                            └─────────────────┘
```

### Backend
- **Express** — REST endpoints for auth, orders, messages
- **Apollo Server (GraphQL)** — parts catalog queries (filtering, sorting)
- **Prisma ORM** — PostgreSQL access
- **JWT** — authentication
- **Multer** — file upload (part images to S3)

### Frontend
- **React 18 + Vite** — SPA
- **TailwindCSS** — styling
- **TanStack Query** — server state
- **React Router** — routing
- **Apollo Client** — GraphQL queries

### Database
- **PostgreSQL 15+**
- **Prisma migrations** — schema versioning

### DevOps
- **Docker + docker-compose** — local dev
- **GitHub Actions** — CI (lint, test, build) + later Aikido scanning
- **AWS EC2 + RDS + S3** — production hosting

---

## 5. Data Model (Overview)

```
User (id, email, password, role, taxNumber, status, createdAt)
  ├─ WholesalerProfile (companyName, address, phone, ...)
  └─ RetailerProfile (companyName, address, phone, ...)

Part (id, sku, oemCode, brand, name, description, category, imageUrl, ...)

PartListing (id, partId, wholesalerId, price, stock, minOrderQty, currency)

Order (id, retailerId, wholesalerId, status, totalAmount, createdAt)
  └─ OrderItem (id, orderId, partListingId, quantity, unitPrice)

DiscountCode (id, code, discountPercent, maxUses, usedCount, expiresAt)

Message (id, orderId, senderId, content, attachmentUrl, createdAt)

Review (id, orderId, retailerId, wholesalerId, rating, comment)
```

---

## 6. Phases

| Phase | Topic | Output |
|-------|-------|--------|
| **Phase 1** | Project scaffolding (Node + React + DB connection) | Empty but running app |
| **Phase 2** | Authentication & user management | Login/register/role flows |
| **Phase 3** | Parts catalog & listings (Wholesaler side) | Wholesalers can add parts |
| **Phase 4** | Search & price comparison (Retailer side) | Retailers can search SKUs |
| **Phase 5** | Cart, checkout, orders | Full order flow |
| **Phase 6** | GraphQL parts catalog API | GraphQL endpoint live |
| **Phase 7** | Messaging & file attachments | Order-scoped chat |
| **Phase 8** | Docker + docker-compose | Containerized local stack |
| **Phase 9** | AWS deployment | Live on EC2 + RDS + S3 |
| **Phase 10** | GitHub Actions + Aikido integration | Full CI/CD + all modules connected |

---

## 7. Deliberate Vulnerabilities — Distribution Across Phases

To make Aikido's dashboard look meaningful during demos, deliberate (controlled) vulnerabilities are scattered across phases — written naturally, as if a developer cut corners under deadline pressure. **Do not fix these unless told to.**

| Phase | Deliberate vulnerabilities |
|-------|----------------------------|
| **Phase 2** | Hardcoded JWT secret, weak password policy, password reset token disclosure in API response, default admin credentials seeded |
| **Phase 3** | SQL injection via raw query in part search, IDOR (wholesaler can read another wholesaler's listings) |
| **Phase 4** | Mass assignment in user profile update, no rate limiting on search endpoint |
| **Phase 5** | Negative quantity allowed in cart, race condition on discount code redemption |
| **Phase 6** | GraphQL introspection enabled in production, no query depth limiting, alias overloading possible, GET requests accepted |
| **Phase 7** | File upload without MIME validation, path traversal in attachment download |
| **Phase 8** | Container runs as root, exposed sensitive ports, hardcoded env vars in Dockerfile |
| **Phase 9** | Public S3 bucket, IAM policy too permissive, security group 0.0.0.0/0 on SSH |
| **Phase 10** | Outdated dependencies (lodash 4.17.10, axios 0.21.0, etc.), GPL-licensed package, AWS access key in `.env.example` |

These vulnerabilities map closely to ACME Sample Pentest Report findings — that mapping is intentional, so during customer demos the parallels are obvious.

---

## 8. Aikido Module Coverage Map

| Aikido Module | What it will detect in ParçaPazar |
|---------------|-----------------------------------|
| **SAST** | SQL injection, hardcoded secrets, IDOR patterns, mass assignment |
| **SCA** | Outdated lodash, axios, express-jwt; vulnerable transitives |
| **Secrets Detection** | AWS keys in `.env.example`, hardcoded JWT secret |
| **IaC Scanning** | Permissive security group in Terraform, root user in Dockerfile |
| **Container Image Scanning** | Eski Node.js base image, vulnerable system packages |
| **License Risk & SBOM** | GPL-licensed package introduced deliberately |
| **Malware Detection** | (Optional) install a known-malicious test package |
| **Outdated Software** | Node.js 16 in Dockerfile (EOL), eski PostgreSQL client |
| **CSPM** | Public S3 bucket, overpermissive IAM |
| **VM Scanning** | EC2 instance with outdated packages |
| **Container Runtime Scanning** | Running container with privileged mode |
| **AI Pentesting** | Authentication bypass, IDOR, business logic flaws |
| **DAST** | Same as pentest but black-box angle |
| **API Discovery & Fuzzing** | GraphQL endpoints, REST APIs |
| **Attack Surface Management** | EC2 public IP, S3 bucket, GitHub repo |
| **Zen Runtime Protection** | Block live SQL injection / prompt injection in production |
| **AI Monitoring** | (Optional) add a small LLM-using endpoint for demo |

---

## 9. Working Principles

These principles apply across all phases. Read them before starting.

1. **Write naturally, not artificially.** When introducing deliberate vulnerabilities, write them like a developer cutting corners — not like a CTF challenge. The point is realism.

2. **Keep commits clean and meaningful.** Each commit should represent one logical chunk. This makes Aikido's PR-level scanning more meaningful in the demo.

3. **Use realistic data.** Sample part SKUs (e.g., BOSCH 0986452041 for brake pads), real automotive brands (Bosch, Mahle, Valeo, NGK), real OEM codes from public catalogs. Demo realism matters.

4. **Don't optimize prematurely.** No caching, no microservices, no fancy patterns. Single Express app, single React app, single PostgreSQL DB. Boring is good.

5. **Document as you go.** Keep a running `NOTES.md` with decisions, gotchas, and TODOs. Useful for the demo storytelling.

6. **Each phase ends with a verification step.** Don't move to the next phase until the current one runs locally.

7. **Aikido integration is Phase 10.** Don't connect Aikido until the app is stable. Otherwise early scans are noisy and confusing.

---

## 10. Repository Structure (Target)

```
parcapazar/
├── README.md
├── NOTES.md                    # Running development log
├── .env.example                # Template (with deliberate AWS key in Phase 10)
├── .gitignore
├── docker-compose.yml          # Phase 8
├── Dockerfile                  # Phase 8
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── index.ts            # Express entry
│   │   ├── app.ts              # Express app setup
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── graphql/            # Phase 6
│   │   ├── lib/                # Utilities
│   │   └── types/
│   └── tests/
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   ├── hooks/
│   │   └── lib/
│   └── public/
│
├── infra/                      # Phase 9
│   ├── terraform/
│   └── deploy/
│
└── .github/
    └── workflows/              # Phase 10
        └── ci.yml
```

---

## 11. Conventions

- **Language:** Code, comments, commit messages in **English**. Customer-facing UI text in **Turkish** (since this is a TR-targeted demo).
- **Branch strategy:** `main` is protected, work in feature branches `phase-N-description`, merge via PR. This makes Aikido's PR scanning more meaningful in the demo.
- **Commit style:** Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- **Linting:** ESLint + Prettier for both backend and frontend (set up in Phase 1).
- **TypeScript:** Used throughout. Strict mode enabled.

---

## 12. Customer Demo Narrative (For Reference)

When presenting ParçaPazar to a customer:

> *"This is a typical B2B marketplace built by a small team in 2-3 weeks. The kind of velocity our customers usually run at. Now let's see what Aikido finds when we connect it to this codebase..."*

Then open Aikido dashboard. The findings should look natural — the kind of issues real-world fast-moving teams produce. That's the whole point.

---

## 13. What Comes Next

After this overview, follow the phase documents in order:

1. **`phase-01-scaffolding.md`** — Set up the empty backend/frontend, connect to a local PostgreSQL.
2. **`phase-02-authentication.md`** — User registration, login, roles, JWT.
3. **`phase-03-parts-catalog.md`** — Wholesalers can list parts.
4. **`phase-04-search-comparison.md`** — Retailers can search and compare.
5. **`phase-05-cart-checkout.md`** — Cart, discount codes, orders.
6. **`phase-06-graphql.md`** — GraphQL parts catalog.
7. **`phase-07-messaging.md`** — Order chat with file attachments.
8. **`phase-08-docker.md`** — Containerize the stack.
9. **`phase-09-aws-deployment.md`** — Deploy to AWS Free Tier.
10. **`phase-10-aikido-integration.md`** — Connect every Aikido module.

Each phase document is self-contained: it tells you what to do, in what order, with verification steps. Follow them sequentially.

---

## 14. Before Starting

Make sure these are installed locally:

- **Node.js 20 LTS** — `node -v` should show `v20.x`
- **npm** (comes with Node) — `npm -v`
- **Git** — `git --version`
- **Docker Desktop** (needed from Phase 8) — `docker -v`
- **A code editor** — Antigravity / Cursor / VS Code

PostgreSQL doesn't need to be installed locally — Phase 1 will run it via Docker.

AWS account with Free Tier — sign up at aws.amazon.com (credit card required for verification, but Free Tier resources cost nothing for 12 months if usage stays within limits).

---

Ready? Start with `phase-01-scaffolding.md`.
