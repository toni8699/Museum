# Phase 5.4 Binary Upload and Package Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drop texture binaries from disk into the editor, save the whole project as a single self-contained `.museumpack.zip`, and re-open that package later without losing parcels. Plain JSON export is hard-blocked when any texture is binary-only; every object URL is tracked and revoked on every code path that can orphan it. Visitor and editor rendering remain on the same `texture-cache.loadSourceTexture` ingestion point.

**Architecture:** A single ZIP archive produced by [`fflate`](https://github.com/101arrowz/fflate). Internal layout is fixed: `museum-scene.json` (rewritten canonical v6) + `manifest.json` + `textures/<file>` × N. SHA-256 fingerprints verify integrity on import. Session-only bytes never enter canonical JSON; object URLs are tracked through a `BinaryTextureStore` and released on Reset/Import/document-swap/unmount. The plain-JSON export gate is one `derived` store reading the document + binary-store state.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3 (node), Three.js / Threlte 7. **One new dep:** `fflate@^0.8.x` (MIT, no transitive deps). Existing v6 codec, `texture-uri`, `material-resource-mutator`, `texture-cache`, `material-resource-mutator.svelte.ts` and the editor entry plugin are reused/extended; no new module families.

## Global Constraints (every task must satisfy)

- **No behaviour change for catalogue-only rendering.** All 675 existing tests stay green.
- **One new dependency only — `fflate`.** Pinned `^0.8.0` in `apps/museum/devDependencies`. Documented in handoff.
- **No commits ever** (per `AGENTS.md`). Step "verify gates" replaces step "commit" throughout.
- **Plain JSON in canonical form.** Canonical v6 JSON never serialises `blob:` URLs or raw bytes. URI is always a root-relative `/textures/...` path.
- **Single ingestion point.** `texture-cache.loadSourceTexture(uri, slot)` is the SOLE entry point for both project-relative URIs (existing fetch path) and binary URIs (Phase 5.4 addition).
- **Variant pool semantics frozen** (Phase 5.3 finalisation). 5.4 only adds dispatch; refCount + dispose + key shape stay put.
- **Manifest is source of truth.** SHA-256 per file; import rejects on fingerprint mismatch.
- **Visitor chunks stay clean.** `MuseumEditorStub.svelte` continues to gate; `package-importer` / `package-exporter` / `binary-texture-store` / `project-export-store` / `fflate` reach `/dev/museum-editor` only. Build verification: `grep -R -l "fflate\\|package-importer\\|package-exporter\\|binary-texture-store\\|project-export-store" apps/museum/.svelte-kit/output/chunks` should match only chunks reachable from the editor entry.
- **Object URL hygiene is unconditional.** Every `URL.createObjectURL` flows through `BinaryTextureStore.acquireObjectUrl`. No direct calls anywhere.
- **Sweeps fire on:** Reset, Import (any kind), document swap (rare path covered by session-state sweep), page unload, test teardown. `clearExcept(remainingUris)` runs after every document mutation that may orphan entries.
- **Verifier contract unchanged.** `texture-verifier.ts` keeps `{ status: 'ready' | 'unsafe-uri' | 'load-failed' }` and its delegated source-loader injection stays; binary URIs work because the verifier already calls `loadSourceTexture` after `isSafeTextureUri`.
- **Verification command** (every task):
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```

---

## File Structure (locked)

| Path | Type | Role |
|---|--:|---|
| `apps/museum/package.json` | MODIFY | Add `fflate@^0.8.0` to `devDependencies` |
| `package.json` (root) | UNCHANGED | No top-level dep; workspace devDep is enough |
| `apps/museum/src/lib/content/package-format.ts` | NEW | Manifest types + format constants + filename sanitization helpers (pure) |
| `apps/museum/src/lib/content/package-format.test.ts` | NEW | Sanitization, collision suffix, manifest serialization, format-version tests |
| `apps/museum/src/lib/editor/import/package-importer.ts` | NEW | `fflate.unzip` driver; manifest validation; safe-URI pass (pure + browser glue) |
| `apps/museum/src/lib/editor/import/package-importer.test.ts` | NEW | Accepts/rejects matrix, fingerprint verification, schema mismatch |
| `apps/museum/src/lib/editor/export/package-exporter.ts` | NEW | `fflate.zip` driver; URI rewrite; resolver injection (pure + browser glue) |
| `apps/museum/src/lib/editor/export/package-exporter.test.ts` | NEW | Rejection without bytes, deterministic rewrite, sanitization, round-trip |
| `apps/museum/src/lib/editor/store/binary-texture-store.svelte.ts` | NEW | Bytes register/resolve/revoke lifecycle; `acquireObjectUrl` helper |
| `apps/museum/src/lib/editor/store/binary-texture-store.test.ts` | NEW | Register, prune-on-clearExcept, revoke-on-reset/release, fingerprint determinism |
| `apps/museum/src/lib/editor/store/project-export-store.svelte.ts` | NEW | Blocker computation + `derived` store reading doc + binary store |
| `apps/museum/src/lib/editor/store/project-export-store.test.ts` | NEW | Null when resolved, populated when not, idempotent, fully covered |
| `apps/museum/src/lib/museum/materials/texture-cache.ts` | MODIFY | Add binary dispatch + `setDefaultTextureSourceLoader` hook; legacy path unchanged |
| `apps/museum/src/lib/museum/materials/texture-cache.test.ts` | MODIFY | Add describes for binary-store path + dispatcher |
| `apps/museum/src/lib/editor/EditorAssetLibrary.svelte` | MODIFY | Drop zone + Source toggle (`Public URI` vs `Local file`) + binary register path |
| `apps/museum/src/lib/editor/EditorProjectMenu.svelte` | MODIFY | `Export Package…` action + Copy/Download JSON gate |
| `apps/museum/src/lib/editor/EditorInspector.svelte` | MODIFY | Render `Material inspector` block on primitive/model (existing) — no shape change in this slice; chip injected in MaterialInspector (below) |
| `apps/museum/src/lib/editor/EditorMaterialInspector.svelte` | MODIFY | Append `(local — requires package on save)` chip near texture picker |
| `apps/museum/src/lib/editor/museum-editor.svelte.ts` | MODIFY | Host `BinaryTextureStore` + `project-export-store` on the facade; add `registerBinaryTexture`, `exportPackage`, `importPackage` |
| `apps/museum/src/lib/editor/MuseumEditorApp.svelte` | MODIFY | `onDestroy` → sweep `pendingObjectUrls` + `releaseAllObjectUrls` on `BinaryTextureStore` |
| `package-lock.json` | MODIFY | Updated by `npm install` after Task 1 |

Each task below produces independently testable changes.

---

### Task 1: Add `fflate` dependency + content `package-format` types and helpers

**Files:**
- Modify: `apps/museum/package.json`
- Create: `apps/museum/src/lib/content/package-format.ts`
- Create: `apps/museum/src/lib/content/package-format.test.ts`

**Interfaces:** Shared types/constants are pure. No Three imports. No browser globals.

- [ ] **Step 1: Add `fflate` to devDependencies** in `apps/museum/package.json`

```json
"devDependencies": {
  …existing…
  "fflate": "^0.8.0"
}
```

(`fflate` is referenced only by editor-only files shipped behind `museum-editor-entry-plugin.ts`'s `serve` branch, which the build path excludes from visitor chunks via the existing `MuseumEditorStub.svelte` gate.)

- [ ] **Step 2: Install** — run:

```bash
cd /Users/tony/Documents/Personal && npm install -w @portfolio/museum
```

Expected: `package-lock.json` updated; `node_modules/fflate/package.json` present.

- [ ] **Step 3: Write failing tests** — `apps/museum/src/lib/content/package-format.test.ts`

Cover at minimum:

- package id derivation: `package-<12 hex>` where `<hex>` is the first 12 hex of `sha256(sortedFingerprints.join('').toLowerCase())`.
- formatVersion check: `formatVersion === 1` accepted; `2`/`0` rejected.
- schemaVersion check: `schemaVersion === 6` accepted; others rejected.
- filename sanitization: lowercase, `_` runs collapsed, leading char safe, max length 128 chars, extension normalized to sniffed MIME.
- collision suffix: deterministic `-2`, `-3`, … for repeats within a single package.
- manifest serialization: round-trips through `JSON.stringify`/`JSON.parse`.
- `manifest.textures.length === count of SceneTextureAsset.uri entries whose URI starts with /textures/<packageId>/`.

Examples:

```ts
describe('package-format', () => {
  it('rejects unsupported formatVersion', () => {
    expect(() => assertManifestVersion({ formatVersion: 2, schemaVersion: 6 })).toThrow(/formatVersion/);
  });
  it('rejects unsupported schemaVersion', () => {
    expect(() => assertManifestVersion({ formatVersion: 1, schemaVersion: 5 })).toThrow(/schemaVersion/);
  });
  it('deterministic package id for identical sorted fingerprints', () => {
    const a = derivePackageId(['fpA', 'fpB']);
    const b = derivePackageId(['fpB', 'fpA']); // sorted internally
    expect(a).toBe(b);
  });
  it('sanitizes a typical junk filename', () => {
    expect(sanitizeFilename('Walnut Wall (Detail).PNG', 'image/png')).toBe('walnut-wall-detail.png');
  });
  it('appends a numeric collision suffix', () => {
    expect(collisionSuffix(['detail.png', 'detail-2.png'], 'detail.png')).toBe('detail-3.png');
  });
});
```

- [ ] **Step 4: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/content/package-format.test.ts
```

Expected: failures — module not found.

- [ ] **Step 5: Implement `package-format.ts`** — create the file. Include:

- Type definitions: `PackageFormatVersion = 1`; `SchemaVersion = 6`; `PackageManifest` (matching the spec's schema including `package.id`, `package.formatVersion`, `package.schemaVersion`, `package.createdAt`, `package.generator`, `package.documentTitle`, `textures[]`); `TextureManifestEntry` (`assetId | originalName | mime | size | fingerprint | destinationPath`).
- `assertManifestVersion(version)` → throws on mismatch.
- `derivePackageId(fingerprints[])` → sorts lexicographically, joins, sha256s, takes first 12 hex chars, prefixes `package-`. Use a tiny pure sha256 (Node `node:crypto` for tests, browser `crypto.subtle` glue lives in importer Task 3).
- `sanitizeFilename(originalName, mime)` → produces a slash-free, NFC-normalized, ASCII-only filename with one of `.png` / `.webp` / `.jpg` / `.jpeg` based on sniffed MIME.
- `collisionSuffix(usedNames[], candidate)` → returns candidate with `-2`, `-3`, … until unique in `usedNames`.
- `REWROTE_URI_PREFIX = (packageId: string) => \`/textures/${packageId}/\`` (constant producer).
- `matchMime(filename, mime)` → returns the appropriate extension based on sniffed MIME.
- Export a small union `SupportedMime = 'image/png' | 'image/webp' | 'image/jpeg'` with a `isSupportedMime(m)` type-guard.

- [ ] **Step 6: Run to verify GREEN**

Same command as Step 4. Expected: all tests pass.

- [ ] **Step 7: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: existing 675 tests stay green; new tests in `package-format.test.ts` pass.

---

### Task 2: Package importer (TDD)

**Files:**
- Create: `apps/museum/src/lib/editor/import/package-importer.ts`
- Create: `apps/museum/src/lib/editor/import/package-importer.test.ts`

**Interfaces:** Single exports: `importPackage(zip: Uint8Array, opts?: { now?: () => Date }): Promise<PackageImportResult>` plus a pure helper `inspectPackage` and the shared `PackageImportResult` type (`status: 'ok' | 'rejected'; …` matching the spec).

- [ ] **Step 1: Write failing tests** — `apps/museum/src/lib/editor/import/package-importer.test.ts`

Cover at minimum:

- accepts a minimal valid `.museumpack.zip` produced by the exporter's tests (Task 3) OR built inline by `fflate.zip`;
- rejects: missing `museum-scene.json`, missing `manifest.json`, wrong `formatVersion`, wrong `schemaVersion`, missing bytes, fingerprint mismatch, unsafe URI inside rewritten JSON;
- verifies every rewritten URI in `museum-scene.json` corresponds to exactly one manifest entry;
- verifies manifest count ≤ JSON count and manifest ⊆ JSON.

Use a builder helper inside the test file that calls `fflate.zip` to construct valid zip bytes. Build `museum-scene.json` from a small in-memory `MuseumSceneDocument` literal and compute `fingerprint` via the project's `node:crypto`.

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/import/package-importer.test.ts
```

Expected: module-not-found failures.

- [ ] **Step 3: Implement `package-importer.ts`**

Implementation skeleton:

```ts
import { unzip } from 'fflate';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { decodeScene } from '$lib/content/scene-codec'; // strict v6 parse
import {
  assertManifestVersion,
  derivePackageId,
  REWROTE_URI_PREFIX,
  type PackageImportResult,
  type PackageManifest,
  type TextureManifestEntry
} from '$lib/content/package-format';
import { sha256Bytes } from '$lib/editor/helpers/package-sha'; // small browser/node glue
import type { MuseumSceneDocument } from '$lib/content/scene';

export async function importPackage(
  zip: Uint8Array,
  opts: { now?: () => Date } = {}
): Promise<PackageImportResult> {
  // 1. Unzip; reject on unzip failure with 'format-unsupported'.
  // 2. Read museum-scene.json and manifest.json; reject on missing entries ('missing-bytes' or 'format-unsupported').
  // 3. JSON.parse both; reject with 'schema-mismatch' on parse error.
  // 4. Run scene-codec strict v6 decode; reject with 'schema-mismatch' on failure.
  // 5. assertManifestVersion({ formatVersion, schemaVersion }); reject with 'format-unsupported' on failure.
  // 6. For each manifest.textures entry: read destinationPath bytes; verify sha256 matches fingerprint ('fingerprint-mismatch'); else reject.
  // 7. Verify every SceneTextureAsset.uri in JSON that starts with /textures/<packageId>/ corresponds to exactly one manifest entry. Compute packageId via derivePackageId(sortedFingerprints). Reject with 'manifest-mismatch'.
  // 8. isSafeTextureUri on every SceneTextureAsset.uri; reject with 'unsafe-uri'.
  // 9. Return { status: 'ok', document, binaries: Map<rewrittenUri, { bytes, mime, fingerprint }>, packageId }.
}
```

(Store the package-id derivation post-fingerprint so manifest ⊆ JSON can be checked with the runtime value.)

`helpers/package-sha.ts` is a tiny new file containing `sha256Bytes(bytes): Promise<string>` that uses `node:crypto` when present and `crypto.subtle.digest('SHA-256', bytes)` in the browser. It has no UI surface and no module side effects.

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: all tests pass.

- [ ] **Step 5: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: 675 prior + ~10 new tests pass; 0 errors / 0 warnings.

---

### Task 3: Package exporter (TDD)

**Files:**
- Create: `apps/museum/src/lib/editor/export/package-exporter.ts`
- Create: `apps/museum/src/lib/editor/export/package-exporter.test.ts`

**Interfaces:**

```ts
export async function buildPackage(
  input: PackageExportInput
): Promise<PackageExportResult>;
export function packageFilename(document: MuseumSceneDocument, now: Date): string;
```

`buildPackage` accepts a `resolveBytesByUri(uri) => Promise<Uint8Array | null>`. The resolver is injection, not a global, so tests can stub it.

- [ ] **Step 1: Write failing tests**

Cover at minimum:

- rejects with `'unresolved-binary'` when `resolveBytesByUri` returns `null` for one or more `SceneTextureAsset.uri`;
- rewrites URIs to `/textures/<packageId>/<sanitizedFilename>` deterministically;
- sanitizes filenames (mixed case, non-ASCII, leading dot, too long);
- collision suffix deterministic across runs;
- `fetch`-then-bytes path is invoked when no binary is registered (using a stub `resolveBytesByUri` that returns `Uint8Array.from([...])`);
- `fflate.unzip(buildPackage(...))` returns the same bytes identical;
- does NOT include the env's `process` in the manifest's `generator` field — only the published name + slice version (`museum-editor-5.4`).

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/export/package-exporter.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `package-exporter.ts`**

Use `zip` from `fflate` (with `ZipLevel = 6` default; do not pass memory option since payloads are small). Compose `museum-scene.json` after rewriting every `SceneTextureAsset.uri` to its rewritten form. Build manifest with sorted fingerprints (then re-derive packageId from sorted fingerprints for deterministic naming). Write to zip and return `{ zip, manifest, filename }`.

```ts
import { zip } from 'fflate';
import { decodeScene } from '$lib/content/scene-codec';
import {
  derivePackageId,
  sanitizeFilename,
  collisionSuffix,
  REWROTE_URI_PREFIX,
  type PackageExportResult,
  type PackageExportInput
} from '$lib/content/package-format';
import type { MuseumSceneDocument } from '$lib/content/scene';
```

`resolveBytesByUri` first-wins policy: try the supplied resolver, return whatever it returns, treat `null` as `'unresolved-binary'` failure.

`packageFilename(document, now)` returns `${document.documentTitle ?? 'museum-scene'}-${formatStamp(now)}.museumpack.zip`. `formatStamp(now)` uses local time `YYYYMMDD-HHMM`.

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: all tests pass.

- [ ] **Step 5: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: 675 prior + new importer/exporter tests all pass.

---

### Task 4: Binary texture store + tests

**Files:**
- Create: `apps/museum/src/lib/editor/store/binary-texture-store.svelte.ts`
- Create: `apps/museum/src/lib/editor/store/binary-texture-store.test.ts`

**Interfaces:** Single `BinaryTextureStore` class with methods listed in the spec plus `session-state.pendingObjectUrls: Set<string>` and an exported integration helper `acquireObjectUrl(bytes, mime): string` plus `releaseObjectUrl(url): void`, `releaseAllObjectUrls(): void`.

- [ ] **Step 1: Write failing tests** at `binary-texture-store.test.ts`

Cover at minimum:

- register same bytes twice ⇒ same fingerprint;
- two distinct byte batches ⇒ different fingerprints;
- `clearExcept` revokes URLs for pruned entries (use a `URL.createObjectURL` stub and assert `revokeObjectURL` calls);
- `releaseAllObjectUrls` empties `pendingObjectUrls`;
- `acquireObjectUrl` is the only call site for `URL.createObjectURL` (probe by replacing the global and ensuring only one call happens per registration);
- fingerprint computed via `sha256Bytes` is exactly the documented format.

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/store/binary-texture-store.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `binary-texture-store.svelte.ts`**

```ts
import { sha256Bytes } from '$lib/editor/helpers/package-sha';

export type BinaryTextureEntry = {
  bytes: Uint8Array;
  mime: string;
  fingerprint: string;
  objectUrl: string | null;
};

class BinaryTextureStoreImpl implements BinaryTextureStore {
  private readonly map = new Map<string, BinaryTextureEntry>();
  private readonly _pending = new Set<string>();
  get pendingObjectUrls(): ReadonlySet<string> { return this._pending; }

  async register(uri: string, bytes: Uint8Array, mime: string): Promise<{ fingerprint: string }> {
    const fingerprint = await sha256Bytes(bytes);
    this.map.set(uri, { bytes, mime, fingerprint, objectUrl: null });
    return { fingerprint };
  }
  has(uri: string): boolean { return this.map.has(uri); }
  async resolve(uri: string): Promise<Uint8Array> {
    const entry = this.map.get(uri);
    if (!entry) throw new Error(`No binary texture registered for ${uri}`);
    return entry.bytes;
  }
  objectUrlFor(uri: string): string | null {
    const entry = this.map.get(uri);
    if (!entry) return null;
    if (!entry.objectUrl) {
      const blob = new Blob([entry.bytes], { type: entry.mime });
      entry.objectUrl = acquireObjectUrl(blob);
    }
    return entry.objectUrl;
  }
  clearExcept(retainUris: ReadonlySet<string>): void {
    for (const [uri, entry] of this.map.entries()) {
      if (retainUris.has(uri)) continue;
      if (entry.objectUrl) releaseObjectUrl(entry.objectUrl);
      this.map.delete(uri);
    }
  }
  releaseAllObjectUrls(): void {
    for (const [uri, entry] of this.map.entries()) {
      if (entry.objectUrl) releaseObjectUrl(entry.objectUrl);
      entry.objectUrl = null;
    }
    for (const url of Array.from(this._pending)) releaseObjectUrl(url);
  }
}

export const BinaryTextureStore = new BinaryTextureStoreImpl();

export function acquireObjectUrl(input: Blob): string {
  const url = URL.createObjectURL(input);
  BinaryTextureStore.pendingObjectUrls.add(url);
  return url;
}
export function releaseObjectUrl(url: string): void {
  BinaryTextureStore.pendingObjectUrls.delete(url);
  URL.revokeObjectURL(url);
}
export function releaseAllObjectUrls(): void {
  BinaryTextureStore.releaseAllObjectUrls();
}
```

(Default-export the singleton. Provide re-exports for tests. The store lives behind `museum-editor-entry-plugin.ts` so visitor never imports it.)

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: tests pass.

- [ ] **Step 5: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: existing + new tests passing; check 0/0.

---

### Task 5: Project-export blocker store + tests

**Files:**
- Create: `apps/museum/src/lib/editor/store/project-export-store.svelte.ts`
- Create: `apps/museum/src/lib/editor/store/project-export-store.test.ts`

**Interfaces:**

```ts
export type ProjectExportBlocker = {
  unresolvedTextures: { id: string; name: string; uri: string }[];
};

export function isDocumentUnresolved(
  document: MuseumSceneDocument,
  binaryStore: BinaryTextureStore
): ProjectExportBlocker | null;

export function unresolvedCount(document, binaryStore): number;
```

- [ ] **Step 1: Write failing tests**

Cover:

- empty document → `null`;
- textures: [] but materials reference nothing → `null`;
- one texture with rewrite URI `/textures/<packageId>/...` and binaryStore has it → `null`;
- one texture with rewrite URI but binaryStore has it not → blocked, single entry;
- one texture URI starts with `/museum/textures/...` and `binaryStore.has(uri)` → `null` (public-fallback path);
- idempotent across re-runs.

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/store/project-export-store.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement `project-export-store.svelte.ts`**

Predicate `is_document_resolved(uri, binaryStore)`:

1. If `binaryStore.has(uri)` → resolved.
2. If `isSafeTextureUri(uri)` AND URI starts with `/textures/` (any package id) → resolved (fetch fallback).
3. Otherwise unresolved.

Walk every `SceneTextureAsset.uri`, collect unresolved ones into `ProjectExportBlocker.unresolvedTextures`. Return null when none.

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2.

- [ ] **Step 5: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

---

### Task 6: Cache binary dispatch + tests

**Files:**
- Modify: `apps/museum/src/lib/museum/materials/texture-cache.ts`
- Modify: `apps/museum/src/lib/museum/materials/texture-cache.test.ts`

**Interfaces:** Add `setDefaultTextureSourceLoader(loader | null)` + `loadSourceTexture(uri, slot)`. Brancher inside `loadSource`: optional injected loader; binary-store hit; public fetch fallback.

- [ ] **Step 1: Extend `texture-cache.test.ts`** with binary-dispatch describes:

- injected `TextureSourceLoader` is called;
- when no loader is injected AND a binary is registered globally (`BinaryTextureStore.register(...)` against a fixed URI in test), the source cache returns a `THREE.Texture`;
- when neither binary nor injection, falls through to existing fetch path (stub `fetch` globally).

Use `vi.mock(...)` for `URL.createObjectURL` and `URL.revokeObjectURL` so tests can assert bookkeeping.

- [ ] **Step 2: Run to verify RED**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/museum/materials/texture-cache.test.ts
```

Expected: new tests fail (the binary branch is not yet implemented).

- [ ] **Step 3: Implement dispatch** — extend `texture-cache.ts`:

- add `defaultSourceLoader: TextureSourceLoader | null = null`;
- `setDefaultTextureSourceLoader` setter restricts writes via `if (loader === null) reset` else `defaultSourceLoader = loader`;
- at the top of `loadSource(uri, slot, namespace)`, after the cache hit, delegate:

```ts
if (defaultSourceLoader) {
  return defaultSourceLoader(uri, slot);
}
const binaryEntry = BinaryTextureStore.has(uri) ? BinaryTextureStore.resolve(uri) : null;
if (binaryEntry) {
  const url = BinaryTextureStore.objectUrlFor(uri);
  if (url) return loadTextureFromUrl(url, slot); // pipe through the existing TextureLoader path
}
return loadSourceFromFetch(uri, slot); // existing implementation
```

(`loadTextureFromUrl` is the small shared helper that wraps `TextureLoader.load`; production behaviour is identical to today for public URIs.)

- [ ] **Step 4: Run to verify GREEN**

Same command as Step 2. Expected: all tests pass.

- [ ] **Step 5: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: existing + new cache describes all pass.

---

### Task 7: Textures library drop zone + Source toggle

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`

**Interfaces:** Add three new behaviour blocks inside the `Textures` tab section:

- `<input type="file" accept="image/png,image/webp,image/jpeg">` for `Local file` selection.
- Drop-zone overlay over the panel that accepts desktop file drops.
- `Source` toggle inside the register form: `Public URI` (existing) | `Local file` (new).
- MIME sniffing helper prefilled into the form.

- [ ] **Step 1: Locate the register form markup** — find the existing Register Texture form (around Name + URI + button). Snapshot a screenshot before changes.

- [ ] **Step 2: Add Source toggle**

Append a small radio group INSIDE the existing Register form. State `sourceMode: 'public' | 'local'`. Default `'public'`. Visual: keep the existing URI text input rendering when `'public'`, replace with `[Choose file]` button + filename preview when `'local'`.

- [ ] **Step 3: Add MIME sniffing helper**

Add `apps/museum/src/lib/editor/helpers/mime-sniff.ts` (~30 LOC, pure). Export `sniffImageMime(bytes: Uint8Array): 'image/png' | 'image/webp' | 'image/jpeg' | null`. Patterns:

- PNG: starts with `89 50 4E 47 0D 0A 1A 0A`.
- WEBP: starts with `52 49 46 46` and `bytes[8..12]` is `57 45 42 50`.
- JPEG: starts with `FF D8 FF`.

Nothing else accepted. Return `null` for unsupported.

Include `mime-sniff.test.ts` covering each pattern + rejection.

- [ ] **Step 4: Wire register path** — when `sourceMode === 'local'`, the Submit handler reads the picked/dropped file via `FileReader.readAsArrayBuffer`, sniffs MIME, calls `store.registerBinaryTexture(name, bytes, mime)` instead of the existing `registerTexture(name, uri)`. The new facade method lands in Task 10. Until then, the call site targets the method name directly and fails type-check — that's why Task 10 lands AFTER Task 7 lands, OR you may merge the wiring into Task 10. (Decision: ship Task 7 with the UI/handlers ready, but the actual dispatch goes via `museumEditorStore.registerBinaryTexture` which Task 10 introduces.)

- [ ] **Step 5: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```

Expected: 0 errors / 0 warnings. Once Task 10 lands the facade method, the registration call site resolves.

---

### Task 8: Project menu Export Package + plain-JSON gate

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorProjectMenu.svelte`

**Interfaces:** New menu item `Export Package…` (always enabled). Existing `Copy JSON` / `Download JSON` read `projectExportStore.blocker` and render disabled with the tooltip "N unresolved texture(s) — Export package to save."

- [ ] **Step 1: Read the existing menu** — locate where `Copy JSON` / `Download JSON` are rendered.

- [ ] **Step 2: Wire blocker into Copy/Download JSON**

Wrap both buttons:

- `disabled={projectExportStore.blocker !== null}`.
- `title={projectExportStore.blocker ? '…' : ''}`.

Add the top-bar chip "N unresolved texture(s) — Export package to save" (visual chip with red dot) reading `projectExportStore.blocker.unresolvedTextures.length`.

- [ ] **Step 3: Add Export Package action**

- Click handler reads `document` + `resolveBytesByUri = (uri) => binaryStore.resolve(uri)`.
- Calls `museumEditorStore.exportPackage(input)` (Task 10 facade).
- On `{ status: 'ok', zip, filename }`, creates a temporary `<a download>` element, calls `URL.createObjectURL(blob)`, registers on `pendingObjectUrls`, triggers click, schedules `releaseObjectUrl` after a 5-second timeout.
- On `{ status: 'rejected' }`, surfaces an error toast / inline message.

- [ ] **Step 4: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```

Expected: 0 errors / 0 warnings.

---

### Task 9: Material inspector chip + MuseumEditorApp unload sweep

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte`

- [ ] **Step 1: Inspector chip**

In the existing Material instance section near the Base texture picker, render an `<output>`-like chip when the assigned material's `baseTextureId` resolves to a binary-store URI:

- chip text: `"Local — requires package on save"`.
- styled with `role="status"` and `aria-describedby` matching the "what is package export?" tooltip line.
- The check at render time: `binaryStore.has(uriFor(instance.baseTextureId))`.

- [ ] **Step 2: App-level sweep**

In `MuseumEditorApp.svelte`, add `onDestroy(() => BinaryTextureStore.releaseAllObjectUrls())`. Also, after every successful Project action (Reset, Import JSON, Import Package, document swap), call the same sweep.

- [ ] **Step 3: Type-check**

```bash
cd /Users/tony/Documents/Personal && npm run check -w @portfolio/museum
```

Expected: 0 errors / 0 warnings.

---

### Task 10: Wire facade methods in `museum-editor.svelte.ts`

**Files:**
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts`

**Interfaces:** Three new public methods on the `MuseumEditorStore` facade:

```ts
async function registerBinaryTexture(
  name: string,
  bytes: Uint8Array,
  mime: string
): Promise<{ id: string; uri: string }>;

async function exportPackage(): Promise<{ status: 'ok' | 'rejected'; filename?: string; zip?: Uint8Array; reason?: string; detail?: string }>;

async function importPackage(zip: Uint8Array): Promise<{ status: 'ok' | 'rejected'; reason?: string; detail?: string }>;
```

Behavior:

- `registerBinaryTexture` registers into `BinaryTextureStore`, derives a rewrite URI placeholder (`/textures/<pendingPackageId>/<sanitizedFilename>` — `pendingPackageId` is a deterministic hash of the project's entire texture IDs so identical binary textures map to the same path; this is reconciled on package export).
- `exportPackage` calls `packageExporter.buildPackage({ document, resolveBytesByUri })` and returns the result.
- `importPackage` calls `packageImporter.importPackage` and, on `'ok'`, primes `BinaryTextureStore` with the importer's `binaries` Map, then runs the standard `commitDocumentFromImport(...)` flow (existing 5.2 path); pre-commit `releaseAllObjectUrls()` clears stale URLs.

- [ ] **Step 1: Read facade surface** — locate where existing `registerTexture`, `probeTexture`, `requestMaterialEdit`, etc. are defined.

- [ ] **Step 2: Add `registerBinaryTexture`**

```ts
async registerBinaryTexture(name: string, bytes: Uint8Array, mime: string) {
  // 1. Reserved ID derivation via existing reserveResourceId('texture').
  // 2. Compute rewrite URI: /textures/<pendingPackageId>/<sanitizedName>.<ext>.
  //    pendingPackageId is hung off session-state.pendingPackageId derived from
  //    sorted fingerprints of EVERY registered texture in the document + this new bytes' fingerprint.
  // 3. bytes-fingerprint via sha256Bytes.
  // 4. beginDocumentTransaction; append one SceneTextureAsset; commit.
  // 5. After commit, BinaryTextureStore.register(uri, bytes, mime).
  // 6. Return { id, uri }.
}
```

- [ ] **Step 3: Add `exportPackage`**

```ts
async exportPackage() {
  const document = …getCurrentDocument();
  return await packageExporter.buildPackage({
    document,
    resolveBytesByUri: async (uri) =>
      BinaryTextureStore.has(uri) ? await BinaryTextureStore.resolve(uri) : null
  });
}
```

- [ ] **Step 4: Add `importPackage`**

```ts
async importPackage(zip: Uint8Array) {
  const result = await packageImporter.importPackage(zip);
  if (result.status !== 'ok') return { status: 'rejected', reason: result.reason, detail: result.detail };
  BinaryTextureStore.releaseAllObjectUrls();
  // Pre-register all binaries into BinaryTextureStore against their rewritten URIs.
  for (const [uri, blob] of result.binaries) {
    await BinaryTextureStore.register(uri, blob.bytes, blob.mime);
  }
  // Now commit document via existing import path.
  await commitDocumentFromImport(result.document);
  return { status: 'ok' };
}
```

The existing `commitDocumentFromImport(...)` already runs validator and history-clears; do not duplicate.

- [ ] **Step 5: Add target tests**

Add small focused tests in `museum-editor.test.ts` and `museum-editor-textures.test.ts` (the existing 5.2/5.3 themed suite) covering:

- `registerBinaryTexture` adds one texture + one history entry;
- duplicate fingerprints do not duplicate the entry;
- `exportPackage` returns `'ok'` with a determined filename + Uint8Array;
- `importPackage` round-trips a previously exported project (synthesize a fresh document, then `await importPackage(buildPackageResult.zip)` and assert the post-import document equals the pre-export document).

- [ ] **Step 6: Full gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
```

Expected: 675 prior + new tests across all 10 tasks all pass.

---

### Task 11: Final verification + handoff

**Files:**
- Create: `docs/agent-handoffs/phase-5.4.md`
- Modify (status): `docs/agent-handoffs/CURRENT.md`
- Modify (status): `docs/plans/museum-editor-workspace/README-museum-editor.md`

- [ ] **Step 1: Full automated gate**

```bash
cd /Users/tony/Documents/Personal && \
  npm run test -w @portfolio/museum && \
  npm run check -w @portfolio/museum && \
  npm run build -w @portfolio/museum && \
  git diff --check
```

Expected: ≥ 700 tests pass (existing 675 + ~25 new); check 0 / 0; build exits 0 (only the `@sveltejs/adapter-auto` env note); `git diff --check` silent.

- [ ] **Step 2: Visitor chunk isolation**

```bash
cd /Users/tony/Documents/Personal && npm run build -w @portfolio/museum && \
  ( grep -R -l "fflate" apps/museum/.svelte-kit/output/chunks 2>/dev/null || echo "no fflate in visitor chunks"; true ) && \
  ( grep -R -l "package-importer\|package-exporter\|binary-texture-store\|project-export-store" apps/museum/.svelte-kit/output/chunks 2>/dev/null || echo "no 5.4 modules in visitor chunks"; true ) && \
  ( grep -R "MuseumEditorStub" apps/museum/.svelte-kit/output/chunks 2>/dev/null | wc -l )
```

Expected: editor-only modules NOT referenced from visitor chunks; `MuseumEditorStub` referenced at least once.

Run `/museum` against the production build (`npm run preview`) and verify the route returns the visitor shell — no error, no editor imports leaked.

- [ ] **Step 3: Browser smoke (via registered preview)**

Recommended flow on `/dev/museum-editor` (this thread's Preview tab):

1. Drop a PNG into the Textures library panel → registers with `(local)` chip.
2. Drag the local texture onto a primitive → renders within one frame.
3. **Copy JSON / Download JSON should be DISABLED** with the tooltip "1 unresolved texture".
4. Click **Export Package…** → single `.museumpack.zip` downloads.
5. Reset the editor. Drop the package into Import Package → identical textures + assignments reappear.
6. Browser DevTools → Application → confirm no orphan `blob:` URLs after Reset, Import, and page unload.

- [ ] **Step 4: Object-URL leak test**

Run vitest with `--detectOpenHandles`:

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run --detectOpenHandles src/lib/editor/store/binary-texture-store.test.ts
```

Expected: 0 open handles after tests.

- [ ] **Step 5: Write the handoff** — `docs/agent-handoffs/phase-5.4.md`

Sections to include (mirror 5.3):

1. **Status** — Complete / awaiting user review.
2. **Date** — today (2026-08-07).
3. **Goal** — One sentence from this plan's Goal.
4. **Delivered** — file-by-file bullet list mapping spec to implementation.
5. **Verification evidence** — tests added (target ~25), total (target 700+), check result, build result, browser results.
6. **Plan deviations** — list any divergence.
7. **New dep note** — `fflate@^0.8.0` MIT, no transitive deps.
8. **Production isolation** — visitor chunks verified clean.
9. **Known limitation** — Per-model UV tiling beyond `[1, 1]` is a follow-on (noted in `phase-5-textures.md`'s known-limitations and `instance-material-remap.ts`'s header). Unrelated to 5.4.
10. **Next slice pointer** — Phase 5.5 (browser/production verification + final handoff) per `phase-5-textures.md` slice 5.5.

- [ ] **Step 6: Update project status files**

- `docs/agent-handoffs/CURRENT.md`: replace the slice pointer with reference to the new handoff.
- `docs/plans/museum-editor-workspace/README-museum-editor.md`: mark Phase 5.4 complete + add 5.5 pointer.

No commits (per AGENTS.md).

---

## Execution Notes

- Each task's tests pass on its own; the full suite runs at the end of each task plus a final gate.
- The natural split puts Task 1 (dep + format types), Tasks 2–5 (pure exports/imports/store; no UI), Tasks 6–9 (renderer + UI), Task 10 (facade), Task 11 (gate+handoff) — each is independently runnable.
- `helpers/package-sha.ts` and `helpers/mime-sniff.ts` are tiny pure helpers; both ship files of <40 LOC and their tests pass before they're consumed.
- If any modified file refuses to compile because of `import.meta.env.DEV`, route the dev-warn through a tiny `isDevEnv` helper (same pattern Task 1 of the 5.3 plan used in `scene-instance-material.ts`).
- The visitor-bundle-clean check (Task 11 Step 2) is the gating mechanism for "no ZIP code in visitor chunks." If that check fails, refactor until it passes before claiming slice complete.
- The `Object URL bookkeeping test` (binary-texture-store.test.ts) covers the only invariant that any surface-area leak would break.
