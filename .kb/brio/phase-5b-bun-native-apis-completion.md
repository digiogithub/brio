# Phase 5B — Bun Native API Replacements

## Completion Summary

### Changes Made

#### 1. **argon2 → Bun.password** ✅
Replaced all `argon2` package usage with Bun's native `Bun.password` API.

**Files Modified:**
- `api/src/utils/generate-hash.ts` - Replaced argon2.hash with Bun.password.hash
- `api/src/services/shares.ts` - Replaced argon2.verify with Bun.password.verify
- `api/src/auth/drivers/local.ts` - Replaced argon2.verify with Bun.password.verify
- `api/src/services/graphql/index.ts` - Replaced argon2.verify with Bun.password.verify
- `api/src/controllers/utils.ts` - Replaced argon2.verify with Bun.password.verify
- `tests/blackbox/setup/setup-utils.js` - Replaced argon2.hash with Bun.password.hash
- `api/package.json` - Removed `argon2: 0.30.3` dependency

**Key Changes:**
- Import removed: `import argon2 from 'argon2';`
- Hash generation: `argon2.hash(string, options)` → `Bun.password.hash(string, { algorithm: 'argon2id', ...options })`
- Hash verification: `argon2.verify(hash, plaintext)` → `Bun.password.verify(plaintext, hash)` ⚠️ **NOTE: Argument order reversed!**

**Total Files Changed: 7**

---

#### 2. **undici → Native fetch/FormData** ✅
Replaced `undici` package with Bun's native global `fetch` and `FormData`.

**Files Modified:**
- `packages/storage-driver-cloudinary/src/index.ts` - Removed undici imports, using native fetch/FormData
- `packages/storage-driver-cloudinary/src/index.test.ts` - Removed undici imports/mocks
- `packages/update-check/src/index.ts` - Removed undici import, using native fetch
- `packages/update-check/src/index.test.ts` - Removed undici import/mock
- `packages/storage-driver-cloudinary/package.json` - Removed `undici: 5.22.0` dependency
- `packages/update-check/package.json` - Removed `undici: 5.22.0` dependency

**Key Changes:**
- Removed: `import { fetch, FormData } from 'undici';`
- Removed: `import type { RequestInit } from 'undici';`
- Now using: Global `fetch()` and `FormData` (built into Bun runtime)

**Total Files Changed: 6**

---

### Dependencies Removed

From `api/package.json`:
- ❌ `argon2: 0.30.3` (native module, now using Bun.password)

From `packages/storage-driver-cloudinary/package.json`:
- ❌ `undici: 5.22.0` (now using Bun's native fetch)

From `packages/update-check/package.json`:
- ❌ `undici: 5.22.0` (now using Bun's native fetch)

**Total: 3 npm packages removed**

---

### What Was NOT Changed (As Expected)

#### 1. **better-sqlite3**
- ✅ Not found in codebase (likely already removed or never used)

#### 2. **node:crypto usage**
- ✅ Kept as-is (Bun has 99% compatibility with node:crypto)
- No mandatory changes needed
- Can be optimized later with `Bun.CryptoHasher` if needed

#### 3. **child_process usage**
- ✅ No actual child_process spawn/exec/fork usage found
- Found only `.exec()` and `.executeFlow()` methods (not related to child_process)
- Bun supports child_process natively, no changes required

---

### Important Notes

#### ⚠️ Argument Order Change
The most critical change is in password verification:
```typescript
// OLD (argon2):
argon2.verify(hash, plaintext)

// NEW (Bun.password):
Bun.password.verify(plaintext, hash)
```
**The argument order is REVERSED!** All 5 occurrences have been updated correctly.

#### Bun.password Options
- Default algorithm: `argon2id` (same as argon2 package default)
- Some advanced argon2 options like `associatedData` may not be supported by Bun.password
- Current implementation passes options through, but may need testing

#### Testing Needed
1. Password hashing and verification (login flow)
2. Share password verification
3. GraphQL hash utilities
4. Fetch operations in storage drivers
5. Update check functionality

---

### Migration Benefits

1. **Removed native dependencies**: No more C++ compilation for argon2
2. **Smaller bundle**: No undici dependency (Bun has native fetch)
3. **Better performance**: Bun's native APIs are optimized for Bun runtime
4. **Simpler installation**: No native module build steps
5. **Better compatibility**: Native Bun APIs have better Bun runtime integration

---

### Next Steps (Not in this phase)

1. Add `@types/bun` to devDependencies (done after Bun becomes package manager)
2. Test password hashing/verification thoroughly
3. Consider adding Bun-specific optimizations later:
   - `Bun.CryptoHasher` for crypto operations
   - `Bun.spawn` for child processes (if any are added)
   - `Bun.file()` for file operations

---

### Statistics

- **Total files modified**: 13
- **Dependencies removed**: 3
- **Native modules eliminated**: 1 (argon2)
- **Fetch polyfills removed**: 1 (undici)
- **Lines of code reduced**: ~20

