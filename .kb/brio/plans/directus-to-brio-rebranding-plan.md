# Brio Rebranding and Migration Plan
## From Directus v9.26.0 (GPL Fork) to Brio BaaS & CMS

**Document Version**: 1.0
**Created**: 2026-02-13
**Project**: Brio - Backend as a Service & CMS Platform
**Fork Origin**: Directus v9.26.0 (last GPL-licensed version)

---

## Executive Summary

This plan details the complete transformation of the Directus v9.26.0 GPL-licensed codebase into **Brio**, a customized BaaS and CMS platform. The project encompasses:

- **6,345 total Directus references** across the codebase
- **18 packages** requiring namespace change from `@brio/*` to `@brio/*`
- **30 system database tables** with `directus_` prefix
- **122 documentation files** with ~1,555 Directus mentions
- **65 i18n translation files** with ~40 Directus references each
- **8 logo/brand files** to replace
- Full **Node.js → Bun.js runtime migration**
- **Dockerfile** rewrite for Bun.js

---

## Codebase Analysis Summary

### Reference Counts by File Type:
| Type       | Count  | Description                              |
|------------|--------|------------------------------------------|
| TypeScript | 2,013  | Core API, packages, utilities            |
| JavaScript | 31     | Build configs, CLI entry                 |
| Vue        | 385    | Frontend components and views            |
| Markdown   | 1,555  | Documentation                            |
| JSON       | 176    | Package configs, manifests               |
| YAML       | 2,185  | i18n translations, docker, specs         |
| **Total**  | **6,345** |                                        |

### Key Identifiers:
- Package scope: `@brio/*` (16 scoped packages)
- CLI binary: `directus`
- Cookie: `directus_refresh_token`
- HTTP header: `X-Powered-By: Directus`
- Vite define: `__DIRECTUS_VERSION__`
- DB tables: `directus_*` (30 system tables)
- Env prefix: `DIRECTUS_*`
- Logo constant: `DIRECTUS_LOGO`

### Node.js Dependencies:
- `node:` protocol imports: 108 files
- `process.*` usage: 132 files
- Node-specific APIs: 136 files
- TSC build scripts: 14 packages

---

## Phase Overview

| Phase | Name                        | Priority | Effort     | Risk   |
|-------|-----------------------------|----------|------------|--------|
| 0     | License & Attribution       | CRITICAL | 1 day      | Low    |
| 1     | Package Identity            | HIGH     | 2-3 days   | Medium |
| 2     | Frontend Branding           | HIGH     | 3-4 days   | Low    |
| 3     | API & Backend               | HIGH     | 3-4 days   | Medium |
| 4     | Documentation               | MEDIUM   | 3-5 days   | Low    |
| 5     | Bun.js Runtime Migration    | HIGH     | 5-7 days   | High   |
| 6     | Dockerfile Adaptation       | HIGH     | 2-3 days   | Medium |
| 7     | DB Tables Rename (Optional) | LOW      | 10-15 days | VERY HIGH |
| 8     | Testing & QA                | HIGH     | 3-5 days   | Medium |
|       | **Total (without Phase 7)** |          | **22-32 days** |     |

---

## Phase 0: License, Attribution and Legal Foundation
**Priority: CRITICAL | Effort: 1 day | Risk: Low**

Must be completed first. Establishes proper GPL v3 attribution.

### Tasks:
1. Create `NOTICE` file documenting fork origin (Directus v9.26.0, Monospace Inc.)
2. Update `LICENSE` adding Brio copyright while preserving original
3. Update `README.md` with Brio branding + fork attribution section
4. Update `CLA.md`, `code_of_conduct.md`, `contributing.md`, `security.md`
5. Replace all Directus URLs/contacts with Brio equivalents

---

## Phase 1: Package Identity Rebranding
**Priority: HIGH | Effort: 2-3 days | Risk: Medium**

### Package Namespace Migration Map:
```
@brio/*  →  @brio/*     (16 packages)
directus     →  brio        (CLI entry package)
create-directus-extension → create-brio-extension
```

### Tasks:
1. Rename all `package.json` name fields
2. Update 800+ import statements (`from '@brio/*'` → `from '@brio/*'`)
3. Update workspace references
4. Rename `directus/` directory to `brio/`
5. Update `pnpm-workspace.yaml`
6. Update CLI entry (`cli.js`)
7. Update tsconfig extends
8. Update `vite.config.js` references
9. Regenerate lockfile

---

## Phase 2: Frontend Branding and Visual Identity
**Priority: HIGH | Effort: 3-4 days | Risk: Low**

### Assets to Replace:
- 4 SVG logos (app + views)
- 1 PNG logo (`directus-white.png`)
- 2 favicon files
- 2 docs logos
- PWA icon set

### Code Changes:
- `constants.ts`: New `BRIO_LOGO` ASCII art
- `main.ts`: Import rename
- `vite-env.d.ts`: `__BRIO_VERSION__` declaration
- `vite.config.js`: Define rename
- `index.html`: Noscript text
- `manifest.webmanifest`: App name
- `app.ts`: X-Powered-By header

### i18n: 65 translation files × ~40 references each

---

## Phase 3: API and Backend Rebranding
**Priority: HIGH | Effort: 3-4 days | Risk: Medium**

### Key Changes:
- Cookie name: `directus_refresh_token` → `brio_refresh_token`
- HTTP header: `X-Powered-By: Directus` → `X-Powered-By: Brio`
- Update check: NPM registry reference
- Extensions SDK CLI: `directus-extension` → `brio-extension`
- OpenAPI specs: All description/example text
- Docs URL in MODULE_BAR_DEFAULT

### Note: System DB tables (`directus_*`) kept as-is for compatibility.

---

## Phase 4: Documentation Rebranding
**Priority: MEDIUM | Effort: 3-5 days | Risk: Low**

- 122 markdown files with ~1,555 Directus references
- Replace brand names, URLs, package references, CLI commands
- Update Netlify config and functions
- Replace documentation logos
- Add Fork Attribution page

---

## Phase 5: Bun.js Runtime Migration
**Priority: HIGH | Effort: 5-7 days | Risk: High**

### 5.1 Package Manager: pnpm → bun
### 5.2 Remove TypeScript Precompilation
- 14 packages use `tsc --build` → Remove, point exports to .ts source
- Bun runs TypeScript natively

### 5.3 API Runtime Adaptation
- Test all `node:` protocol imports (108 files)
- Review native addon compatibility (sharp, better-sqlite3, argon2)
- Consider Bun built-ins: `bun:sqlite`, `Bun.password`, `Bun.spawn`

### 5.4 Key Incompatibilities to Check:
- `better-sqlite3` → `bun:sqlite` (built-in)
- `argon2` → `Bun.password` (built-in)
- `sharp` → Test latest version
- `knex` → Test database driver compatibility
- `express` + middleware → Full Bun compatibility
- `vitest` → Works under Bun

### 5.5 Build Scripts
- Update all scripts from pnpm/npm to bun
- Remove tsc compilation steps
- Keep Vite for frontend (Vite supports Bun)

---

## Phase 6: Dockerfile and Container Adaptation
**Priority: HIGH | Effort: 2-3 days | Risk: Medium**

### Image Migration:
```
node:18-alpine  →  oven/bun:latest(-slim|-alpine)
pnpm commands   →  bun commands
tsc build       →  Removed (Bun runs TS)
node cli.js     →  bun cli.js
/directus       →  /brio
```

### Docker Compose:
- Update POSTGRES_DB: `directus` → `brio`
- Update documentation URL references

---

## Phase 7: Database System Tables Renaming (OPTIONAL)
**Priority: LOW | Effort: 10-15 days | Risk: VERY HIGH**

**RECOMMENDATION: Defer to future major version.**

30 system tables with `directus_` prefix deeply embedded in:
- 50+ migration files
- All service classes
- Schema introspection package
- OpenAPI specs

Alternative: Implement `TABLE_PREFIX` env var for configurable prefix.

---

## Phase 8: Testing, QA and Validation
**Priority: HIGH | Effort: 3-5 days | Risk: Medium**

1. Unit tests under Bun runtime
2. Integration tests with all database drivers
3. Build verification (packages, Docker)
4. Branding verification (UI, logos, CLI)
5. Runtime verification (API, auth, files, WebSocket, extensions)
6. Regression check (no remaining @brio/* imports breaking)
7. Performance baseline (Bun vs Node comparison)

---

## Execution Dependencies

```
Phase 0 (License)
    ↓
Phase 1 (Packages) ←→ Phase 2 (Frontend) [can be parallel]
    ↓
Phase 3 (API) ←→ Phase 4 (Docs) [can be parallel]
    ↓
Phase 5 (Bun Migration)
    ↓
Phase 6 (Dockerfile)
    ↓
Phase 8 (Testing)
    ↓
Phase 7 (DB Tables) [optional, defer]
```

## Parallelization Strategy

Work can be parallelized using sub-agents:
- **Agent A**: Phases 0 + 1 (License + Packages)
- **Agent B**: Phase 2 (Frontend Branding)
- **Agent C**: Phase 4 (Documentation)
- After convergence: Phases 3 → 5 → 6 → 8 (sequential, dependent)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing DB installations | Keep directus_ prefix, defer rename |
| Bun native addon incompatibility | Test early, have Node fallback |
| Missing Directus references | Automated grep scan post-migration |
| Translation inconsistencies | Automated script for i18n replacement |
| pnpm-lock.yaml conflicts | Clean regeneration with bun |

---

## Success Criteria

- [ ] Zero "Directus" text visible in UI (except legal attribution)
- [ ] All packages resolve as @brio/*
- [ ] CLI command is `brio` not `directus`
- [ ] Docker image builds and deploys with Bun
- [ ] All tests pass under Bun runtime
- [ ] Performance equal or better than Node.js baseline
- [ ] GPL v3 license properly attributed
- [ ] Documentation fully rebranded
- [ ] New Brio logos in all locations
