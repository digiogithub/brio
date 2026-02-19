# Brio runtime notes (Bun + Docker)

## Bun local run (no Docker)
- Install deps: `bun install`
- Ensure `.env` exists with DB + SECRET (SQLite default works)
- Bootstrap DB + admin (first run): `bun /www/Brio/brio/brio/cli.js bootstrap`
- Start server: `bun /www/Brio/brio/brio/cli.js start`
- Optional dev loops:
  - API dev: `bun --cwd /www/Brio/brio/api run dev`
  - App dev: `bun --cwd /www/Brio/brio/app run dev`

## Docker compose build fix
Docker build failed with `bun install --frozen-lockfile` because workspaces include `docs` and `tests/*` but their `package.json` files were not copied before install.

Fix in `Dockerfile` (builder stage): copy missing workspace package manifests:
- `docs/package.json`
- `packages/tsconfig/package.json`
- `tests/blackbox/package.json`

This allows Bun to resolve all workspaces during install. After change, run:
`docker compose -f docker-compose.prod.yml up --build`.

## Context
Root `package.json` workspaces: `brio`, `app`, `api`, `docs`, `packages/*`, `tests/*`.