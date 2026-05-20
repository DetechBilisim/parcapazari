# Phase 8 — Docker & Containerization

> **Goal:** Containerize the full ParçaPazar stack — backend, frontend, and database — so it runs with a single `docker compose up`. This produces production-like deployment artifacts (Dockerfiles, compose config) and, critically, gives Aikido's Container Image Scanning and IaC Scanning modules something to analyze. By the end of this phase, the entire app runs in containers locally.

> **Estimated time:** 2–3 hours
> **Phase outcome:** Fully containerized stack. Container-specific and IaC vulnerabilities planted for Aikido's infrastructure scanning modules.

---

## Important Note on This Phase

**No application functionality changes in Phase 8.** The app behaves exactly as before — you're just packaging it into containers. The purpose is twofold:

1. Produce deployment artifacts needed for Phase 9 (AWS deployment)
2. Give Aikido's Container Image Scanning and IaC Scanning modules real targets

Don't expect new features here. The "output" is a working containerized stack and a set of deliberately misconfigured infrastructure files.

---

## What's Included in This Phase

1. Backend Dockerfile (multi-stage build)
2. Frontend Dockerfile (build + Nginx serve)
3. Nginx config for frontend
4. Updated `docker-compose.yml` (all three services)
5. `.dockerignore` files
6. Health checks
7. **Deliberate vulnerabilities:** root user, outdated base image, hardcoded env vars, exposed ports

---

## Step 8.1 — Backend Dockerfile

Create **`backend/Dockerfile`**:

```dockerfile
# ParçaPazar Backend — multi-stage build

# ---- Build stage ----
FROM node:16-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# ---- Production stage ----
FROM node:16-alpine

WORKDIR /app

# Hardcoded database connection for convenience
ENV DATABASE_URL="postgresql://parcapazar:parcapazar_dev_password@postgres:5432/parcapazar_dev?schema=public"
ENV PORT=4000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/index.js"]
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **Outdated base image** — `node:16-alpine`. Node.js 16 reached end-of-life in September 2023. It no longer receives security patches. Aikido Outdated Software + Container Image Scanning both flag this.
>
> 2. **Hardcoded credentials in `ENV`** — the `DATABASE_URL` (including the password) is baked into the image layer. Anyone who pulls this image from a registry can extract the password with `docker history` or by inspecting layers. Aikido Secrets Detection + Container Image Scanning catch this.
>
> 3. **Runs as root** — no `USER` directive, so the container runs as root. A container escape gives the attacker root on the host. Aikido Container Image Scanning flags this.

---

## Step 8.2 — Backend `.dockerignore`

Create **`backend/.dockerignore`**:

```
node_modules
dist
.env
.env.*
*.log
uploads
.git
```

---

## Step 8.3 — Frontend Dockerfile

Create **`frontend/Dockerfile`**:

```dockerfile
# ParçaPazar Frontend — build + Nginx serve

# ---- Build stage ----
FROM node:16-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# API URL baked in at build time
ENV VITE_API_URL=http://localhost:4000

RUN npm run build

# ---- Serve stage ----
FROM nginx:1.21-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **Outdated base images** — `node:16-alpine` (EOL) and `nginx:1.21-alpine` (old, multiple CVEs). Container Image Scanning flags both.
>
> 2. **Build-time API URL hardcoding** — `VITE_API_URL` baked into the bundle. Not a critical vulnerability but a configuration smell Aikido may note.

---

## Step 8.4 — Nginx Config

Create **`frontend/nginx.conf`**:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # SPA routing — all routes fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # No security headers configured (deliberate)
}
```

> ⚠️ **Deliberate vulnerability:** No security headers (`X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`). Aikido DAST and AI Pentest flag missing security headers — same class as ACME PT-13.

---

## Step 8.5 — Frontend `.dockerignore`

Create **`frontend/.dockerignore`**:

```
node_modules
dist
.env
.env.*
*.log
.git
```

---

## Step 8.6 — Update docker-compose.yml

Replace the root **`docker-compose.yml`** (the one from Phase 1 that only had PostgreSQL) with the full stack:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    container_name: parcapazar-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: parcapazar
      POSTGRES_PASSWORD: parcapazar_dev_password
      POSTGRES_DB: parcapazar_dev
    ports:
      - "0.0.0.0:5432:5432"
    volumes:
      - parcapazar-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U parcapazar"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: parcapazar-backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql://parcapazar:parcapazar_dev_password@postgres:5432/parcapazar_dev?schema=public"
      PORT: 4000
    ports:
      - "4000:4000"
    volumes:
      - ./backend/uploads:/app/uploads

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: parcapazar-frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "8080:80"

volumes:
  parcapazar-pgdata:
```

> ⚠️ **Deliberate vulnerabilities planted:**
>
> 1. **PostgreSQL exposed on `0.0.0.0:5432`** — the database port is bound to all network interfaces, not just localhost or the internal Docker network. On a cloud server this means the database is reachable from the internet. Aikido IaC Scanning flags this.
>
> 2. **Plaintext credentials in compose file** — `POSTGRES_PASSWORD` and `DATABASE_URL` in plaintext. Should use secrets management or `.env` references. Aikido IaC Scanning + Secrets Detection catch this.

---

## Step 8.7 — Run Migrations Inside the Container

Since the backend now runs in a container, you need to run Prisma migrations against the containerized database. There are two approaches; use whichever is cleaner for you.

**Approach A — Run migrations from host (simplest):**

Keep your local `.env` pointing to `localhost:5432`, then:

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

This works because the Postgres container exposes 5432 to the host.

**Approach B — Run migrations inside the backend container:**

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db seed
```

---

## Step 8.8 — Build and Run the Full Stack

From the project root:

```bash
# Build all images
docker compose build

# Start everything
docker compose up -d
```

Watch the logs:

```bash
docker compose logs -f
```

You should see:
- `parcapazar-postgres` becomes healthy
- `parcapazar-backend` connects and logs "🚀 ParçaPazar backend running"
- `parcapazar-frontend` Nginx starts

Verify each service:

```bash
docker compose ps
# All three should be "Up"
```

**Test the stack:**

- Backend health: `http://localhost:4000/api/health`
- Frontend: `http://localhost:8080`
- GraphQL: `http://localhost:4000/graphql`

If migrations were run (Step 8.7), login with the seeded admin (`admin@parcapazar.com` / `admin2026`) should work through the containerized frontend.

---

## Step 8.9 — Verify the Deliberate Vulnerabilities Exist

These checks confirm the vulnerabilities are present (for later Aikido demonstration):

**Check 1 — Hardcoded credentials in image layers:**

```bash
docker history parcapazar-backend --no-trunc | grep DATABASE_URL
```

You should see the `DATABASE_URL` with the password exposed in the image history.

**Check 2 — Container runs as root:**

```bash
docker compose exec backend whoami
```

Should print `root`.

**Check 3 — PostgreSQL exposed externally:**

```bash
# From host, this connects — confirming the port is open
docker compose exec postgres pg_isready -h 0.0.0.0 -p 5432
```

**Check 4 — Base image version:**

```bash
docker compose exec backend node --version
```

Should print `v16.x` (EOL).

---

## Step 8.10 — Commit

```bash
git add .
git commit -m "feat: phase 8 docker containerization"
```

Update `NOTES.md`.

---

## Phase 8 — Verification Checklist

- [ ] `backend/Dockerfile` builds successfully
- [ ] `frontend/Dockerfile` builds successfully
- [ ] `frontend/nginx.conf` created
- [ ] `.dockerignore` files created for both
- [ ] `docker-compose.yml` updated with all three services
- [ ] `docker compose build` completes without errors
- [ ] `docker compose up -d` starts all three containers
- [ ] All containers show "Up" in `docker compose ps`
- [ ] Backend health endpoint reachable at `http://localhost:4000/api/health`
- [ ] Frontend reachable at `http://localhost:8080`
- [ ] Login works through the containerized frontend
- [ ] Phase 8 changes committed

---

## Deliberate Vulnerabilities Introduced in Phase 8

| # | Location | Vulnerability | Aikido module that catches it |
|---|----------|---------------|-------------------------------|
| 1 | `backend/Dockerfile`, `frontend/Dockerfile` | Outdated EOL base image (`node:16-alpine`) | Container Image Scanning + Outdated Software |
| 2 | `backend/Dockerfile` | Hardcoded `DATABASE_URL` with password in `ENV` | Secrets Detection + Container Image Scanning |
| 3 | `backend/Dockerfile` | Container runs as root (no `USER` directive) | Container Image Scanning |
| 4 | `frontend/Dockerfile` | Outdated `nginx:1.21-alpine` with known CVEs | Container Image Scanning |
| 5 | `frontend/nginx.conf` | Missing security headers | DAST + AI Pentest (similar to ACME PT-13) |
| 6 | `docker-compose.yml` | PostgreSQL exposed on `0.0.0.0:5432` | IaC Scanning |
| 7 | `docker-compose.yml` | Plaintext credentials in compose file | IaC Scanning + Secrets Detection |

---

## Notes for the Aikido Demo (Phase 10)

When Aikido scans this in Phase 10, the Container Image Scanning module will produce a rich set of findings:

- Multiple OS-level CVEs from the EOL Node 16 Alpine base
- The hardcoded credential in the image layer
- Root user warning
- Recommendation to upgrade to a supported, hardened base image

This is the perfect demo moment to introduce Aikido's **Hardened Images** offering: "Instead of patching all these CVEs yourself, use a pre-hardened base image — findings drop from dozens to near-zero."

The IaC Scanning findings on `docker-compose.yml` will appear in a separate category, demonstrating that Aikido covers both the built image and the infrastructure definition.

---

## What Comes Next

**Phase 9 — AWS Deployment:**
- Deploy to AWS Free Tier (EC2 + RDS + S3)
- Terraform infrastructure definition
- Migrate part image storage from local filesystem to S3
- Configure security groups, IAM roles
- Point a domain / use the EC2 public IP

Deliberate vulnerabilities to come:
- Public S3 bucket
- Overly permissive IAM policy
- Security group allowing SSH from 0.0.0.0/0

This is where you'll need your AWS Free Tier account ready. Container Image Scanning, CSPM, and VM Scanning all become live after this phase.

When you're ready, request `phase-09-aws-deployment.md`.
