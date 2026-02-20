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

## Environment configuration

Brio uses a single `.env` file at the **root of the repo**. The API reads it
via a symlink (`api/.env -> ../.env`) because `bun run --filter` sets the cwd
to each package's directory.

Minimum required variables (already set in the repo `.env`):

```env
# Security (required)
KEY=change-this-key
SECRET=change-this-secret

# Database — SQLite for local dev (no Docker needed)
DB_CLIENT=sqlite3
DB_FILENAME=/www/Brio/brio/database/database.sqlite

# Admin user (only used during first bootstrap)
ADMIN_EMAIL=admin@brio.local
ADMIN_PASSWORD=changeme

# App/Public URL
PUBLIC_URL=http://localhost:8055

# Telemetry (disabled for development)
TELEMETRY=false
```

> If using Postgres/MySQL instead of SQLite, add `DB_HOST`, `DB_PORT`,
> `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` and change `DB_CLIENT` accordingly.

## Database setup (first time)

### 1. Ensure directories exist

```bash
mkdir -p database api/uploads
```

### 2. Ensure the .env symlink exists

```bash
# The API resolves .env from its own cwd, so it needs a symlink to the root
ln -sf /www/Brio/brio/.env /www/Brio/brio/api/.env
```

### 3. Build the specs package (required once)

The API needs `packages/specs/dist/openapi.json` which must be generated:

```bash
bun run --filter @brio/specs build
```

### 4. Bootstrap the database

This creates all Brio system tables and the first admin user:

```bash
bun run --filter @brio/api cli bootstrap
```

The bootstrap reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env` **only on first run** (when the database has no tables yet). If the database already exists, bootstrap only runs pending migrations and skips admin creation entirely.

To reset the database and start fresh:

```bash
rm -f database/database.sqlite
bun run --filter @brio/api cli bootstrap
```

### 5. Login credentials

After bootstrap, log in at `http://localhost:8080/admin/` with the values from `.env`:
- Email: `admin@brio.local`
- Password: `changeme`

## Start development

All packages (packages/*) run TypeScript natively via Bun — no dev build needed.

### Start API + App simultaneously (from repo root)

```bash
bun run dev
```

### Start only the API (port 8055 by default)

```bash
bun run dev:api
```

### Start only the App / frontend (Vite on port 8080, proxies to API)

```bash
bun run dev:app
```

> The App uses `bunx --bun vite` to run Vite under Bun's runtime so it can
> resolve TypeScript workspace packages natively (no compilation needed).

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

## CLI commands

```bash
bun run --filter @brio/api cli <command>
```

| Command | Description |
|---------|-------------|
| `bootstrap` | Initialize DB schema + create admin user |
| `database install` | Install system tables (without admin) |
| `database migrate:latest` | Apply all pending migrations |
| `database migrate:up` | Apply next migration |
| `database migrate:down` | Revert last migration |
| `users create --email X --password Y --role Z` | Create a user |
| `users passwd --email X --password Y` | Reset a user's password |
| `roles create --role X [--admin]` | Create a role |
| `schema snapshot [path]` | Export schema to YAML/JSON |
| `schema apply <path>` | Apply a schema snapshot |
| `security key:generate` | Generate a new KEY value |
| `security secret:generate` | Generate a new SECRET value |

## Key differences from original Directus v9.26.0

| Directus (original) | Brio |
|---------------------|------|
| `pnpm install` | `bun install` |
| `pnpm run dev` | `bun run dev` |
| `tsx watch src/start.ts` | `bun --watch src/start.ts` |
| `vite` (Node runtime) | `bunx --bun vite` (Bun runtime) |
| Node.js >= 18 | Bun >= 1.1.0 |
| Build step needed for packages | No build — Bun runs TS natively |
| `.env` per package | Single `.env` at repo root (symlinked) |
| Telemetry enabled | Telemetry disabled (`TELEMETRY=false`) |

## Production

```bash
docker compose -f docker-compose.prod.yml up
```
