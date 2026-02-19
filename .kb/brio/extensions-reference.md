# Brio Custom Extensions Reference

## Available Extensions

### 1. yaml-migrations (hook + endpoint)
YAML-based schema and data migration system for Brio/Directus 9.

**Components:**
- `extensions/hooks/yaml-migrations/` — Auto-applies pending migrations on startup
- `extensions/endpoints/yaml-migrations/` — REST API at `/yaml-migrations` for migration management

**API Endpoints:**
- `GET /yaml-migrations` — List all migrations with status
- `GET /yaml-migrations/collections` — List available collections
- `POST /yaml-migrations/export` — Export schema/data as YAML migration
- `POST /yaml-migrations/apply` — Apply specific or all pending migrations
- `POST /yaml-migrations/upload` — Upload raw YAML migration files

**Environment Variables:**
- `YAML_MIGRATIONS_DIR` / `DIRECTUS_YAML_MIGRATIONS_DIR` / `MIGRATIONS_DIR` — Directory containing migration files (default: `./migrations`)
- `YAML_MIGRATIONS_AUTO` — Auto-run migrations on startup (default: `true`). Set to `false` or `0` to disable.
- `YAML_MIGRATIONS_HARD_FAIL` — If `true`, Brio startup fails if any migration fails (default: `false`)
- `YAML_MIGRATIONS_LOCALHOST_ONLY` — Restrict endpoint access to localhost only (default: `true`)
- `YAML_MIGRATIONS_ALLOW_REMOTE` — Override localhost restriction (default: `false`)
- `YAML_MIGRATIONS_RETRY_FAILED` — Retry previously failed migrations on auto-run (default: `false`)
- `YAML_MIGRATIONS_APPLY_DRIFTED` — Re-apply migrations whose file content changed after being applied (default: `false`)
- `YAML_MIGRATIONS_FORCE_SCHEMA` — Force schema diffs despite hash mismatches (default: `false`)
- `YAML_MIGRATIONS_MAX_UPLOAD_BYTES` — Max upload file size in bytes (default: 5MB)

**Migration File Format:**
```yaml
kind: directus-yaml-migration
version: 1
name: my-migration
createdAt: 2025-01-01T00:00:00Z
schema:
  snapshot: { ... }
data:
  collections:
    - collection: my_collection
      match: [id]
      items:
        - id: 1
          name: example
```

**Tracking Table:** `directus_yaml_migrations` (auto-created)

---

### 2. age-encryption (hook + endpoint)
End-to-end field encryption using AGE (Actually Good Encryption).

**Components:**
- `extensions/hooks/age-encryption/` — Encrypts on create/update, decrypts on read
- `extensions/endpoints/age-encryption/` — REST API at `/age-encryption` for key management

**How it works:**
- Fields marked with `interface: 'age-encrypted'` in directus_fields.meta are automatically encrypted/decrypted
- Encryption happens transparently on `items.create` and `items.update` filter hooks
- Decryption is opt-in: requires `X-Age-Decrypt: 1` header or `?age_decrypt=1` query param
- Only admins or roles listed in `AGE_DECRYPT_ALLOW_ROLES` can decrypt

**API Endpoints:**
- `GET /age-encryption` or `GET /age-encryption/status` — Encryption status (admin only)
- `POST /age-encryption/generate-keypair` — Generate new AGE keypair (admin only)
- `POST /age-encryption/delete-private-key` — Scrub leaked key markers from settings (admin only)
- `POST /age-encryption/decrypt` — Decrypt a single ciphertext (authorized roles)

**Environment Variables:**
- `AGE_RECIPIENT` — Public AGE recipient key (required for encryption)
- `AGE_IDENTITY` — Private AGE identity key (required for decryption, NEVER stored in DB)
- `AGE_DECRYPT_ALLOW_ROLES` — Comma-separated list of role UUIDs allowed to decrypt

**Security Notes:**
- Private keys are NEVER persisted in Directus settings
- The hook scrubs any leaked AGE markers from public_note/project_descriptor on startup
- If encryption is misconfigured, fields are stored as null (never plaintext)

---

## Build Commands (bun)

From the monorepo root:

```bash
# Install all dependencies (extensions are workspaces)
bun install

# Build all extensions
bun run ext:build

# Watch mode (dev) for all extensions
bun run ext:dev
```

Individual extension build: `cd extensions/hooks/age-encryption && bun run build`

## Extension Development Setup

Extensions are registered as bun workspaces in the root package.json:
```json
"workspaces": ["extensions/hooks/*", "extensions/endpoints/*"]
```

The SDK is referenced as `"@brio/extensions-sdk": "workspace:*"` (local monorepo package).

Build scripts use the SDK CLI directly via TypeScript source:
```json
"build": "bun run ../../../packages/extensions-sdk/src/cli/run.ts build"
```

## Extension package.json Template

```json
{
  "name": "brio-my-extension-hook",
  "version": "0.1.0",
  "brio:extension": {
    "type": "hook",
    "path": "./dist/index.js",
    "source": "./src/index.ts",
    "host": "^9.0.0"
  },
  "scripts": {
    "build": "bun run ../../../packages/extensions-sdk/src/cli/run.ts build",
    "dev": "bun run ../../../packages/extensions-sdk/src/cli/run.ts build -w --no-minify"
  },
  "devDependencies": {
    "@brio/extensions-sdk": "workspace:*",
    "typescript": "^5.7.3"
  }
}
```

IMPORTANT: The `brio:extension` object MUST include both `path` (output) AND `source` (input) fields. The Zod schema in `packages/constants/src/extensions.ts` validates this.

Migrated from Directus 11 backend (Veridas/altan-mx) to Brio 9 (Directus 9 fork).
Key adaptations: SDK import changed to @brio/extensions-sdk, removed directus_policies references, simplified age-encryption to use meta JSON column (D9 style).
