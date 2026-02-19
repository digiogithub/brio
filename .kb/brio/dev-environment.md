# Brio Development Environment

## Overview

Brio runs on **Bun.js** (>=1.1.0) instead of Node.js. The monorepo uses Bun workspaces. TypeScript is executed natively by Bun — no build step required for packages.

## Prerequisites

- Bun >= 1.1.0
- Docker & Docker Compose (for infrastructure services)

## Install dependencies

```bash
bun install
```

## Infrastructure (Docker)

The `docker-compose.yml` file spins up all supported database vendors + Redis + S3 (Minio). Use it only for development/debugging — NOT for production.

```bash
# Start only the services you need (example: Postgres + Redis)
docker compose up postgres redis

# Start all services (all DB vendors + Redis + Minio + etc.)
docker compose up
```

Default ports:
- Postgres: 5100
- MySQL 8: 5101
- MariaDB: 5102
- Redis: 5105
- Minio (S3): 5106
- Minio Admin: 5112

Default credentials: see `docker-compose.yml` header comments.

## Environment configuration (API)

Create `api/.env` before starting:

```bash
cp api/.env.example api/.env   # if it exists
```

Minimum required variables:

```env
DB_CLIENT=pg                    # or mysql, sqlite3, mssql, oracledb
DB_HOST=localhost
DB_PORT=5100
DB_DATABASE=brio
DB_USER=postgres
DB_PASSWORD=secret

KEY=<random-32-char-string>
SECRET=<random-32-char-string>

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=yourpassword
```

## Database bootstrap (first time only)

```bash
bun run --filter @brio/api cli bootstrap
```

## Start development

All packages (packages/*) run TypeScript natively via Bun — no dev build needed.

### Start API + App simultaneously (from repo root)

```bash
bun run dev
```

### Start only the API (port 8055 by default)

```bash
bun run dev:api
# equivalent to: cd api && bun --watch src/start.ts
```

### Start only the App / frontend (Vite, port 5173 by default)

```bash
bun run dev:app
# equivalent to: cd app && vite --clearScreen false
```

### Start from each subpackage directly

```bash
# API
cd api
NODE_ENV=development SERVE_APP=false bun --watch src/start.ts

# App
cd app
bun run dev    # uses vite internally
```

## Available root scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start API + App simultaneously |
| `bun run dev:api` | Start only the API with hot-reload |
| `bun run dev:app` | Start only the frontend Vite dev server |
| `bun run build` | Build all packages except docs |
| `bun run test` | Run all tests |
| `bun run lint` | Run ESLint |
| `bun run format` | Format files with Prettier |

## CLI

```bash
bun run --filter @brio/api cli <command>

# Examples:
bun run --filter @brio/api cli bootstrap    # initialize DB schema + admin user
bun run --filter @brio/api cli migrate:run  # apply pending migrations
```

## Key differences from original Directus v9.26.0

| Directus (original) | Brio |
|---------------------|------|
| `pnpm install` | `bun install` |
| `pnpm run dev` | `bun run dev` |
| `tsx watch src/start.ts` | `bun --watch src/start.ts` |
| Node.js >= 18 | Bun >= 1.1.0 |
| Build step needed for packages | No build — Bun runs TS natively |

## Production

```bash
docker compose -f docker-compose.prod.yml up
```
