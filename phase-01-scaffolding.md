# Phase 1 — Project Scaffolding

> **Goal:** Set up an empty but running monorepo with backend (Express + TypeScript) and frontend (React + Vite + TypeScript), connected to a local PostgreSQL via Docker. By the end of this phase, you should be able to run the app locally and see a "Hello from ParçaPazar" message both in the browser and from a backend API call.

> **Estimated time:** 1–2 hours
> **Phase outcome:** Empty app skeleton, ready for Phase 2 (authentication).

---

## Prerequisites Check

Before starting, run these in your terminal and confirm versions:

```bash
node -v       # Should show v20.x
npm -v        # Should show 10.x or higher
git --version # Any recent version
docker -v     # Docker version 24+ (Docker Desktop running)
```

If any are missing, install them before proceeding.

---

## Step 1.1 — Initialize the Repository

Create the project root directory and initialize Git:

```bash
mkdir parcapazar
cd parcapazar
git init
```

Create the basic top-level files:

**`README.md`**
```markdown
# ParçaPazar

B2B marketplace connecting automotive parts wholesalers with retailers.

## Stack
- Backend: Node.js + Express + TypeScript + Prisma
- Frontend: React + Vite + TypeScript + TailwindCSS
- Database: PostgreSQL (Docker)
- GraphQL: Apollo Server (Phase 6)

## Getting Started

See `parcapazar-master.md` and follow the phase documents in order.
```

**`.gitignore`**
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*

# Editor
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Database
*.sqlite
*.db

# Misc
.cache/
coverage/
```

**`NOTES.md`** (running development log — keep adding to this throughout the project)
```markdown
# ParçaPazar — Development Notes

## Phase 1 (date: TODO)
- Initialized repo
- Set up monorepo: `backend/` and `frontend/` separate workspaces
- PostgreSQL via Docker, port 5432
- TypeScript everywhere

## Decisions
- ES Modules in backend (`"type": "module"` in package.json)
- TanStack Query in frontend instead of Redux
```

Commit:

```bash
git add .
git commit -m "chore: initial repo setup"
```

---

## Step 1.2 — Set Up Local PostgreSQL via Docker

Create `docker-compose.yml` at the project root:

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
      - "5432:5432"
    volumes:
      - parcapazar-pgdata:/var/lib/postgresql/data

volumes:
  parcapazar-pgdata:
```

Start PostgreSQL:

```bash
docker compose up -d
```

Verify it's running:

```bash
docker ps
# You should see parcapazar-postgres listed and healthy
```

Test connectivity (optional but recommended):

```bash
docker exec -it parcapazar-postgres psql -U parcapazar -d parcapazar_dev -c "SELECT version();"
```

You should see PostgreSQL version output.

---

## Step 1.3 — Backend Scaffolding

```bash
mkdir backend
cd backend
npm init -y
```

Edit the generated `package.json`:

```json
{
  "name": "parcapazar-backend",
  "version": "0.1.0",
  "description": "ParçaPazar backend API",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write src"
  },
  "license": "MIT"
}
```

Install runtime dependencies:

```bash
npm install express cors dotenv helmet
npm install @prisma/client
```

Install dev dependencies:

```bash
npm install -D typescript tsx @types/node @types/express @types/cors
npm install -D eslint prettier
npm install -D prisma
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create the source structure:

```bash
mkdir -p src/routes src/controllers src/middleware src/services src/lib src/types
```

**`src/index.ts`**
```typescript
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 ParçaPazar backend running on http://localhost:${PORT}`);
});
```

**`src/app.ts`**
```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

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
```

**`.env`** (in `backend/`)
```
PORT=4000
DATABASE_URL="postgresql://parcapazar:parcapazar_dev_password@localhost:5432/parcapazar_dev?schema=public"
```

**`.env.example`** (commit this; in `backend/`)
```
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
```

Initialize Prisma:

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma`. Edit it to look like this for now (we'll add models in Phase 2):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Phase 2 will add User model
```

Run the dev server:

```bash
npm run dev
```

Visit `http://localhost:4000/api/health` in your browser. You should see:

```json
{
  "status": "ok",
  "service": "parcapazar-backend",
  "message": "Hello from ParçaPazar 🔧"
}
```

Stop the server (Ctrl+C). Go back to project root:

```bash
cd ..
```

---

## Step 1.4 — Frontend Scaffolding

From the project root:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

Install additional dependencies:

```bash
npm install @tanstack/react-query react-router-dom axios
npm install -D tailwindcss postcss autoprefixer
```

Initialize Tailwind:

```bash
npx tailwindcss init -p
```

Edit `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Replace `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  background: #f8fafc;
}
```

Create the basic source structure:

```bash
mkdir -p src/pages src/components src/api src/hooks src/lib
```

Replace `src/App.tsx`:

```typescript
import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  service: string;
  message: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:4000/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg w-full">
        <h1 className="text-3xl font-bold text-slate-900 mb-3">
          ParçaPazar
        </h1>
        <p className="text-slate-600 mb-6">
          Otomotiv yedek parça B2B platformu
        </p>

        <div className="border-t pt-6">
          <p className="text-sm text-slate-500 mb-2">Backend health check:</p>
          {error && (
            <pre className="text-red-600 text-xs">Error: {error}</pre>
          )}
          {health && (
            <pre className="text-green-700 text-xs bg-green-50 p-3 rounded">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
```

**`.env`** (in `frontend/`)
```
VITE_API_URL=http://localhost:4000
```

**`.env.example`** (in `frontend/`)
```
VITE_API_URL=http://localhost:4000
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`. You should see a centered card with "ParçaPazar" title and the backend health check JSON displayed in green.

Stop the server (Ctrl+C). Go back to project root:

```bash
cd ..
```

---

## Step 1.5 — Verify Everything Together

Open three terminal windows / tabs:

**Terminal 1 — Database (already running from Step 1.2)**
```bash
docker ps
# Confirm parcapazar-postgres is up
```

**Terminal 2 — Backend**
```bash
cd backend
npm run dev
```

**Terminal 3 — Frontend**
```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in browser. The frontend should load and successfully fetch the backend health endpoint, showing the green JSON response.

✅ **If you see this, Phase 1 is complete.**

---

## Step 1.6 — Final Commit

From project root:

```bash
git add .
git commit -m "feat: phase 1 scaffolding complete (backend + frontend + db)"
```

Update `NOTES.md` with the date and any decisions/issues you ran into.

---

## What You Should Have at the End of Phase 1

```
parcapazar/
├── README.md
├── NOTES.md
├── .gitignore
├── docker-compose.yml
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── .env.example
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.ts
│       ├── app.ts
│       ├── routes/
│       ├── controllers/
│       ├── middleware/
│       ├── services/
│       ├── lib/
│       └── types/
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── .env
    ├── .env.example
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── pages/
        ├── components/
        ├── api/
        ├── hooks/
        └── lib/
```

---

## Phase 1 — Verification Checklist

Tick these before moving to Phase 2:

- [ ] `docker compose up -d` starts PostgreSQL successfully
- [ ] `cd backend && npm run dev` starts the backend on port 4000
- [ ] `http://localhost:4000/api/health` returns JSON with status "ok"
- [ ] `cd frontend && npm run dev` starts the frontend on port 5173
- [ ] `http://localhost:5173` loads and displays the green health response
- [ ] All Phase 1 changes committed to Git

---

## Notes for Phase 1

**No deliberate vulnerabilities yet.** Phase 1 is just scaffolding — clean and minimal. Vulnerabilities start in Phase 2 with authentication.

**ES Module note:** The backend uses ES Modules (`"type": "module"` in `package.json`). When importing local files, always include the `.js` extension even though the source is `.ts`:

```typescript
import { app } from "./app.js";  // ✅ correct
import { app } from "./app";      // ❌ won't work with ESM
```

This is a TypeScript + ESM quirk; just remember the rule.

**About the database connection:** Prisma is installed but not yet used. Phase 2 will introduce the first models (User, etc.) and run the first migration.

---

## What Comes Next

**Phase 2 — Authentication & User Management:**
- User registration with role selection (wholesaler/retailer)
- Email verification (mock for now)
- Login with JWT
- Tax number submission for company verification
- Admin approval flow
- First deliberate vulnerabilities (hardcoded JWT secret, password reset bypass, weak password policy)

When you're ready, request `phase-02-authentication.md`.
