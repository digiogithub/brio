# Bun.js Migration Guide for Brio Project
## Node.js → Bun.js Runtime Migration Reference

### Key Bun.js Facts (v1.3+, 2026)
- 96%+ Node.js test suite compatibility
- Native TypeScript execution (no tsc needed)
- Built-in SQLite via `bun:sqlite`
- Built-in password hashing via `Bun.password` (supports argon2id)
- `node:fs`, `node:path`, `node:crypto` (99%), `node:http` (98%) compatible
- 10-30x faster package installs than npm/pnpm

### Package Manager Migration (pnpm → bun)
```bash
# Delete old lock and node_modules
rm -rf node_modules pnpm-lock.yaml
# Or migrate directly
bun pm migrate  # migrates lockfile without install
bun install     # generates bun.lockb
```

### Removing TypeScript Precompilation
- All packages using `"build": "tsc --build"` → Remove, run .ts directly
- `bun run your-script.ts` — no compilation needed
- For bundling: `bun build ./src/index.ts --outdir ./dist`
- Keep `tsconfig.json` for type checking only: `bun x tsc --noEmit`
- Update package.json exports to point to `.ts` source files instead of `dist/`

### bun:sqlite vs better-sqlite3
```typescript
// OLD (better-sqlite3)
import Database from 'better-sqlite3';
const db = new Database('mydb.sqlite');

// NEW (bun:sqlite) - Built-in, no npm package needed
import { Database } from 'bun:sqlite';
const db = new Database('mydb.sqlite');
// API is very similar, supports WAL mode, transactions, prepared statements
db.run("PRAGMA journal_mode = WAL;");
```

### Bun.password vs argon2
```typescript
// OLD (argon2)
import argon2 from 'argon2';
const hash = await argon2.hash(password);
const valid = await argon2.verify(hash, password);

// NEW (Bun.password) - Built-in, no npm package needed
const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
const valid = await Bun.password.verify(password, hash);
```

### Dockerfile Template
```dockerfile
FROM oven/bun:1.3 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:app  # Only Vite frontend build needed

FROM oven/bun:1.3-slim AS runtime
USER bun
WORKDIR /brio
EXPOSE 8055
COPY --from=builder --chown=bun:bun /app .
CMD ["bun", "cli.js", "start"]
```

### Express Compatibility
- Express works fully under Bun (98% node:http tests pass)
- `bun add express` — runs directly
- All middleware compatible

### Knex Compatibility
- Knex works with Bun for PostgreSQL, MySQL, SQLite
- For SQLite, can use `bun:sqlite` driver or keep existing
- Transactions, pooling work natively

### Sharp Compatibility
- Sharp works under Bun (node:fs 100%, node:crypto 99%)
- `bun add sharp` — runs without issues
- Test image transformations after migration

### Workspace Configuration
```toml
# bunfig.toml (replaces .npmrc / pnpm config)
[install]
# equivalent to pnpm workspace
```

Bun supports workspaces via package.json `workspaces` field (same as npm/yarn):
```json
{
  "workspaces": ["packages/*", "api", "app", "brio", "docs", "tests/*"]
}
```

### Key Bun APIs for Replacement
| Node.js | Bun Built-in | Notes |
|---------|-------------|-------|
| `better-sqlite3` | `bun:sqlite` | Built-in, faster, similar API |
| `argon2` | `Bun.password` | Supports argon2id, bcrypt |
| `child_process.spawn` | `Bun.spawn` | Simpler API |
| `fs.readFile` | `Bun.file().text()` | Optional, node:fs also works |
| `fs.writeFile` | `Bun.write()` | Optional, node:fs also works |
| `crypto.createHash` | `Bun.CryptoHasher` | Faster, optional |
| `fetch` (undici) | Global `fetch` | Built-in, no import needed |
| `node` CLI | `bun` CLI | Drop-in replacement |

### Vitest Compatibility
- Vitest works under Bun runtime
- Alternative: `bun test` (built-in test runner, Jest-compatible API)
- Migration: `import { describe, it, expect } from 'bun:test'`

### Environment Variables
- `NODE_ENV` — Supported by Bun
- `NODE_OPTIONS=--max-old-space-size=8192` — Remove (Bun handles memory differently)
- Process env: `process.env` works as-is in Bun