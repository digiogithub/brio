# Directus References Quick Reference Guide

## ✅ LEGITIMATE References (DO NOT CHANGE)

These references are intentional and should remain:

### 1. Database Table Prefixes
**Pattern:** `directus_*`  
**Count:** 30 system tables  
**Examples:**
- `directus_users`
- `directus_collections`
- `directus_fields`
- `directus_permissions`

**Reason:** Database schema compatibility. Renaming would break existing installations.

---

### 2. External NPM Package
**Package:** `@directus/format-title`  
**Locations:**
- `api/package.json:79`
- `app/package.json:35`

**Reason:** Third-party dependency from npm registry. Not part of this codebase.

---

### 3. JWT Issuer Strings
**Pattern:** `issuer: 'directus'`  
**Locations:**
- `api/src/services/users.ts:155, 431, 455`
- `api/src/services/shares.ts:93`

**Reason:** Backward compatibility for existing JWT tokens. Changing would invalidate all active sessions.

**Consideration:** Future versions could support both issuers.

---

### 4. CDN References
**URLs:**
- `https://cdn.directus.io`

**Locations:**
- `api/src/app.ts:123, 126, 127` (CSP headers)

**Reason:** Content Security Policy allows loading official Directus documentation images/videos. Safe to keep for compatibility.

---

### 5. Test Data Fixtures
**Pattern:** Test strings containing "directus"  
**Examples:**
- `value: ['test', 'directus']` in payload tests
- `directus: '0.0.0'` in schema test mocks

**Reason:** Test data doesn't affect runtime behavior.

---

### 6. Fork Attribution
**Locations:**
- `readme.md:28` → "Repository: github.com/directus/directus"
- `NOTICE` file
- `contributing.md` sections

**Reason:** Legal requirement and transparency about fork origin.

---

### 7. GitHub Issue Links
**Pattern:** `github.com/directus/directus/issues/...`  
**Example:** `api/src/exceptions/forbidden.ts:13`

**Reason:** Historical reference to original upstream discussion/issue.

---

## ❌ PROBLEMATIC References (SHOULD CHANGE)

These references should be updated for brand consistency:

### API Layer

| File | Line | Current | Should Be | Priority |
|------|------|---------|-----------|----------|
| `api/src/services/graphql/index.ts` | 1911-1913 | `directus: { type: 'server_info_directus' }` | `brio: { type: 'server_info_brio' }` | HIGH |
| `api/src/types/snapshot.ts` | 8 | `directus: string` | `brio: string` | HIGH |
| `api/src/utils/get-snapshot.ts` | 38 | `directus: version` | `brio: version` | HIGH |
| `api/src/utils/telemetry.ts` | 11 | `https://telemetry.directus.io/` | Disable or use Brio endpoint | LOW |
| `api/src/cli/commands/init/index.ts` | 123 | `npx directus start` | `bun brio start` | HIGH |
| `api/src/cli/commands/schema/apply.ts` | 24 | `directus bootstrap` | `brio bootstrap` | HIGH |
| `api/src/middleware/authenticate.ts` | 10 | `import isDirectusJWT` | `import isBrioJWT` | MEDIUM |

### Packages Layer

| File | Line | Current | Should Be | Priority |
|------|------|---------|-----------|----------|
| `packages/constants/src/extensions.ts` | 31 | `EXTENSION_PKG_KEY = 'directus:extension'` | `'brio:extension'` | HIGH |
| `packages/extensions-sdk/...create.ts` | 183 | `'directus-extension add'` | `'brio-extension add'` | HIGH |
| `packages/extensions-sdk/...link.ts` | 41 | `directus:extension` | `brio:extension` | HIGH |

### Frontend Layer

| File | Line | Current | Should Be | Priority |
|------|------|---------|-----------|----------|
| `app/src/stores/server.ts` | 29, 61, 96, 124 | `directus?: { ... }` | `brio?: { ... }` | MEDIUM |
| `app/src/shims.d.ts` | 36 | `@directus-extensions` | `@brio-extensions` | MEDIUM |
| `app/src/components/v-icon/custom-icons.ts` | 1 | `CustomIconDirectus` | `CustomIconBrio` | MEDIUM |
| `app/src/views/shared/shared-view.vue` | 15 | `class="directus-logo"` | `class="brio-logo"` | MEDIUM |
| `app/src/views/public/public-view.vue` | 9 | `class="directus-logo"` | `class="brio-logo"` | MEDIUM |
| `app/src/layouts/map/index.ts` | Multiple | `directusSource`, `directusLayers` | `brioSource`, `brioLayers` | MEDIUM |
| `app/src/layouts/map/components/map.vue` | 8 occurrences | `'__directus'` (MapBox source) | `'__brio'` | HIGH |
| `app/src/layouts/map/style.ts` | 7 occurrences | `source: '__directus'` | `source: '__brio'` | HIGH |

### Documentation

| File | Issue | Priority |
|------|-------|----------|
| `brio/readme.md` | Still has Directus logo and branding | HIGH |
| `packages/*/README.md` | References to Directus | LOW |
| `.github/agents/directus-programming.md` | Agent name and description | MEDIUM |
| `.github/ISSUE_TEMPLATE/*.yml` | References to Directus project | MEDIUM |

---

## 🔍 How to Verify

### Find all non-legitimate references:
```bash
cd /www/Brio/brio

# Exclude legitimate patterns
grep -rn "directus" \
  --include="*.ts" --include="*.js" --include="*.vue" \
  . 2>/dev/null \
  | grep -v node_modules \
  | grep -v ".git/" \
  | grep -v "directus_"                    # DB tables
  | grep -v "@directus/format-title"       # npm package
  | grep -v "issuer: 'directus'"           # JWT issuer
  | grep -v "DirectusTokenPayload"         # Type name for compat
  | grep -v "cdn.directus.io"              # CDN URL
  | grep -v "test.*directus"               # Test data
  | grep -v "github.com/directus/directus" # Fork attribution
  | grep -v "discussions/4368"             # GitHub issue link
  | grep -v "'directus'"                   # Quoted test strings
```

---

## 🎯 Rename Strategy

### Phase 1: Safe Internal Renames (No Breaking Changes)
- Variable names (`directusSource` → `brioSource`)
- CSS classes (`directus-logo` → `brio-logo`)
- Map source IDs (`__directus` → `__brio`)
- CLI messages

### Phase 2: API Schema Updates (Minor Breaking)
- GraphQL schema field names
- Server info structure
- Internal type names

### Phase 3: Extension System (Major Breaking)
- Package manifest key (`directus:extension` → `brio:extension`)
- Extension CLI commands
- **Requires migration guide for extension developers**

### Phase 4: Database Schema (Future Major Version)
- Snapshot format field names
- Consider supporting both formats temporarily

---

## 🛡️ Testing After Renames

For each category of renames:

1. **Variable/Class Renames:**
   - Visual regression testing
   - Component unit tests

2. **API Schema Changes:**
   - GraphQL query tests
   - API integration tests
   - Update frontend queries if needed

3. **Extension System:**
   - Test extension loading
   - Test extension creation
   - Update example extensions

4. **Snapshot Format:**
   - Test snapshot export
   - Test snapshot import
   - Test with old format (if supporting)

---

**Last Updated:** 2026-02-13  
**Status:** Reference document for Phase 8 cleanup work
