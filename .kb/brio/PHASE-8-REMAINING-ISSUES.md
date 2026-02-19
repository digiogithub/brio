# Phase 8: Remaining Issues Tracker

## 🔴 CRITICAL - BLOCKING DEPLOYMENT

### Issue #1: Missing @brio/tsconfig Package
**Status:** OPEN  
**Priority:** P0 - BLOCKER  
**Assigned:** TBD

**Problem:**
15 packages reference `@brio/tsconfig@0.0.7` but the package doesn't exist in the workspace.

**Impact:**
- `bun install` fails completely
- No builds can run
- Entire project blocked

**Affected Packages:**
- api
- packages/exceptions
- packages/storage*
- packages/types
- packages/extensions-sdk
- packages/update-check
- packages/schema
- packages/constants
- packages/utils
- packages/composables

**Solution Options:**
1. Create `packages/tsconfig/` with base configs
2. Remove dependency and inline configs
3. Use alternative config package

**Files to Create (Option 1):**
```
packages/tsconfig/
├── package.json
├── base.json
├── node.json
└── browser.json
```

---

## 🟡 HIGH PRIORITY

### Issue #2: GraphQL Schema Uses 'directus' Names
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `api/src/services/graphql/index.ts:1911-1913`

**Changes Needed:**
```typescript
// BEFORE:
directus: {
  type: 'server_info_directus',

// AFTER:
brio: {
  type: 'server_info_brio',
```

**Impact:** API schema consistency

---

### Issue #3: CLI Messages Reference 'directus' Command
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `api/src/cli/commands/init/index.ts:123`
- `api/src/cli/commands/schema/apply.ts:24`

**Changes Needed:**
```javascript
// BEFORE:
process.stdout.write(`  ${chalk.blue('npx directus')} start\n`);
logger.error(`Directus isn't installed...run "directus bootstrap"...`);

// AFTER:
process.stdout.write(`  ${chalk.blue('bun brio')} start\n`);
logger.error(`Brio isn't installed...run "brio bootstrap"...`);
```

---

### Issue #4: Map Component Uses '__directus' Source ID
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `app/src/layouts/map/components/map.vue` (8 occurrences)
- `app/src/layouts/map/style.ts` (7 occurrences)
- `app/src/layouts/map/index.ts`

**Changes Needed:**
```typescript
// BEFORE:
map.addSource('__directus', ...)
source: '__directus'

// AFTER:
map.addSource('__brio', ...)
source: '__brio'
```

**Testing Required:** Map rendering and interactions

---

### Issue #5: Snapshot Schema Uses 'directus' Field
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `api/src/types/snapshot.ts:8`
- `api/src/utils/validate-snapshot.ts`
- `api/src/utils/get-snapshot.ts:38`
- `api/src/__utils__/snapshots.ts` (multiple)

**Consideration:** This may be a breaking change for existing snapshot files.

**Changes Needed:**
```typescript
// BEFORE:
export interface Snapshot {
  directus: string;
  ...
}

// AFTER:
export interface Snapshot {
  brio: string;  // or keep 'directus' for backward compat?
  ...
}
```

**Decision Required:** Break compatibility or maintain field name?

---

### Issue #6: Extension SDK References
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `packages/extensions-sdk/src/cli/commands/create.ts:183`
- `packages/extensions-sdk/src/cli/commands/link.ts:41`
- `packages/constants/src/extensions.ts:31`

**Changes Needed:**
```typescript
// BEFORE:
packageManifest['scripts']['add'] = 'directus-extension add';
const type = extensionManifest['directus:extension']?.type;
export const EXTENSION_PKG_KEY = 'directus:extension';

// AFTER:
packageManifest['scripts']['add'] = 'brio-extension add';
const type = extensionManifest['brio:extension']?.type;
export const EXTENSION_PKG_KEY = 'brio:extension';
```

**Impact:** Extension development workflow changes (breaking)

---

### Issue #7: Main CLI README Needs Rewrite
**Status:** OPEN  
**Priority:** P1 - HIGH

**Files:**
- `brio/readme.md`

**Current State:**
- Still shows Directus logo
- Text says "Directus is a free and open-source..."
- Links to directus.io

**Required:**
- Replace with Brio branding
- Explain fork relationship
- Update all links

---

## 🟢 MEDIUM PRIORITY

### Issue #8: CSS Class Names
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `app/src/views/shared/shared-view.vue:15`
- `app/src/views/public/public-view.vue:9`

**Changes:**
```vue
<!-- BEFORE -->
<img ... class="directus-logo" />

<!-- AFTER -->
<img ... class="brio-logo" />
```

**Impact:** CSS may need updates if class is styled

---

### Issue #9: Variable Names in Map Layout
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `app/src/layouts/map/index.ts` (directusSource, directusLayers)
- `app/src/layouts/map/map.vue` (props)

**Changes:** Rename for consistency (non-breaking internal change)

---

### Issue #10: Server Store References
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `app/src/stores/server.ts` (multiple)

**Changes:**
```typescript
// BEFORE:
directus?: { ... }
info.directus = ...

// AFTER:
brio?: { ... }
info.brio = ...
```

**Consideration:** May affect frontend components

---

### Issue #11: Custom Icon Import
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `app/src/components/v-icon/custom-icons.ts:1`

**Changes:**
```typescript
// BEFORE:
import CustomIconDirectus from './custom-icons/directus.vue';

// AFTER:
import CustomIconBrio from './custom-icons/brio.vue';
```

**Check:** File `custom-icons/directus.vue` may need renaming

---

### Issue #12: TypeScript Shims
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `app/src/shims.d.ts:36`

**Changes:**
```typescript
// BEFORE:
declare module '@directus-extensions' {}

// AFTER:
declare module '@brio-extensions' {}
```

---

### Issue #13: GitHub Issue Templates
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `.github/ISSUE_TEMPLATE/*.yml`
- `.github/DISCUSSION_TEMPLATE/*.yml`

**Changes Required:**
- Update references to Directus
- Point to Brio resources
- Update Discord/community links

---

### Issue #14: Agent Configuration
**Status:** OPEN  
**Priority:** P2 - MEDIUM

**Files:**
- `.github/agents/directus-programming.md`

**Changes:**
- Rename file to `brio-programming.md`
- Update description
- Update tools list if needed

---

## 🔵 LOW PRIORITY

### Issue #15: Telemetry Endpoint
**Status:** OPEN  
**Priority:** P3 - LOW

**Files:**
- `api/src/utils/telemetry.ts:11`

**Current:**
```typescript
await axios.post('https://telemetry.directus.io/', {
```

**Options:**
1. Disable telemetry
2. Set up Brio telemetry endpoint
3. Keep sending to Directus (disclose in privacy policy)

---

### Issue #16: Package READMEs
**Status:** OPEN  
**Priority:** P3 - LOW

**Files:**
- Multiple package README files

**Changes:** Update descriptions to reference Brio

---

## 📋 TESTING CHECKLIST

Once blocking issues resolved:

- [ ] `bun install` completes successfully
- [ ] `bun run build` completes for all packages
- [ ] `bun run test` passes
- [ ] CLI starts: `bun brio/cli.js start`
- [ ] Admin UI loads in browser
- [ ] Can create a collection
- [ ] Can add items to collection
- [ ] GraphQL queries work
- [ ] Extensions can be loaded
- [ ] Map layout renders correctly
- [ ] Authentication flows work
- [ ] Database snapshots import/export

---

**Last Updated:** 2026-02-13  
**Total Issues:** 16 (1 blocking, 6 high, 8 medium, 1 low)
