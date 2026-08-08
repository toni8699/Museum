# Phase 5.4 — Binary Texture Upload, Object URLs, and Package Export

**Date:** 2026-08-07
**Status:** Awaiting user review
**Parent plan:** [`../../plans/museum-editor-workspace/phase-5-textures.md`](../../plans/museum-editor-workspace/phase-5-textures.md) slice 5.4
**Prior slice:** [`../../agent-handoffs/phase-5.3.md`](../../agent-handoffs/phase-5.3.md)
**Carry-over design:** [`./2026-08-04-phase-5-3-shared-material-rendering-design.md`](./2026-08-04-phase-5-3-shared-material-rendering-design.md)

## Goal

Let users load texture binaries from disk into the editor and save/load the project as a single self-contained package. Plain JSON export must refuse to continue when the document references textures that only exist in browser memory. Object URLs are tracked and revoked on every code path that can orphan them.

**Format locked at design time (per plan):** a single ZIP archive written by [`fflate`](https://github.com/101arrowz/fflate), with a deterministic internal layout and a top-level `manifest.json`. Round-trip uses the same library.

## Scope

### Includes

- Editor-only binary import path for textures registered from local files (`<input type="file">` + drag/drop into the Textures library panel).
- Session-only binary store: `{ bytes: Uint8Array, mime, fingerprint, objectUrl?: string }` keyed by rewritten canonical URI.
- Single source-loader path in `texture-cache.ts` that resolves both project-relative public URIs *and* in-memory binary URIs through one shared call site (`loadSourceTexture`).
- Editor **Export Package** action producing a `.museumpack.zip` containing the canonical v6 JSON, a `manifest.json`, and the binary bytes — one download.
- Editor **Import Package** action consuming the `.museumpack.zip`, validating the manifest against the embedded JSON, registering binaries, and remounting textures on the same `loadSourceTexture` path.
- Plain-JSON export gate: `Copy JSON` / `Download JSON` render disabled with a "needs package" tooltip when at least one texture in the document is unresolved in binary form.
- Object-URL hygiene: every `URL.createObjectURL` is recorded on session state, revoked on Reset / Import / Replace / document-swap / page unload.
- Three new slices gated by vitest + svelte-check.

### Excludes

- Filesystem `Save` (lock for later; "Package export is deferred" wording from Phase 5 README still applies).
- Image editing, format conversion, MIP generation, or format discovery beyond MIME sniffing on import.
- Texture scene objects, UV editing, shader editors, paint tools.
- Server-side upload, account persistence, multi-user concurrency, or networked sync.
- New texture formats beyond `.png`/`.webp`/`.jpg`/`.jpeg` (anything `image/*` whose MIME the browser can decode). Reject by MIME; no extension-only sniffing.
- New runtime dependencies beyond `fflate`.
- Production visitor chunks: rendering visitor remains `/museum` and consumes **only** resolved texture URIs the runtime serves from the static path or the loaded package. Visitor chunk MUST NOT bundle an "import-package" code path.
- File System Access API / directory handle / streaming readers — out.
- Cryptographic signing, content-addressable hashes, or package versioning telemetry.

## Locked decisions

1. **Format = ZIP archive. Library = `fflate`.** ZIP is the only package surface. No dual file. No tarball. No directory handle.
2. **Internal layout is fixed.** Every package contains exactly three top-level entries: `museum-scene.json`, `manifest.json`, `textures/<file>` × N. The renderer expects this layout; files outside the layout reject import.
3. **Manifest is the source of truth for package contents.** `museum-scene.json` is rewritten with canonical URIs; `manifest.json` enumerates every byte path, size, fingerprint, and MIME. Import verifies manifest ⊆ JSON.
4. **Canonical URI rewrite is deterministic per `packageId` + `originalName`.** `/textures/wood-walnut/map.png` (project-rel) becomes `/textures/<packageId>/<sanitizedFilename>` in the package JSON; the package JSON's `textures[]` entries' `uri` fields reflect this. Rewriting is one-way inside the package (re-import uses package JSON directly).
5. **The renderer integrates binaries through `texture-cache.loadSourceTexture`.** This is the SAME entry point 5.3 wired up. The verifier, `SceneInstanceMaterial`, `EntityPrimitive`, and `AssetModel` are unchanged from the visitor.
6. **Object URLs are tracked globally on `session-state.pendingObjectUrls: Set<string>` and revoked in a single sweep helper.** Every `URL.createObjectURL` call site runs through a small helper `acquireObjectUrl(bytes, mime) → string`.
7. **Plain-JSON export gate is unconditional.** If any texture entry's `uri` cannot be resolved as a public path under `isSafeTextureUri` AND the binary store does not contain the rewritten URI, the document is "blocked from plain JSON export." UX gates Copy JSON / Download JSON buttons and surfaces a "Needs package" badge listing each unresolved entry by ID.
8. **No automatic `URL.createObjectURL` on import.** Object URLs are created lazily on first cache resolution; the cache call passed the URI registers whether it was binary or public so the URL is created on demand and revoked on session teardown.
9. **`fflate` is the only new dep.** MIT, no transitive deps, streaming-friendly for both write and read. Test it under vitest's node + browser env via an in-memory roundtrip.
10. **No Renaming of `texture-cache.ts`'s variant pool.** Phase 5.3 explicitly forbids touching variant semantics. 5.4 only adds a new `loadSource` branch and a new `loadEffectiveTextures` source path; refCount and disposal contracts stay frozen.
11. **Visitor production chunks do not include the export/import code.** Both halves live behind the editor entry plugin's `serve` mode (`museum-editor-entry-plugin.ts`). The plugin already gates the editor entry; production build uses `MuseumEditorStub.svelte` and excludes real editor modules. Phase 5.4 must not pull ZIP code into the visitor chunk graph. Verification step after build: `find apps/museum/.svelte-kit/output -name '*.museumpack*' -o -name 'package-importer*' -o -name 'package-exporter*' -o -name 'binary-texture-store*' -o -name 'project-export-store*' | xargs -I{} grep -l -E 'fflate|package-importer' {/} 2>/dev/null` — should return zero matches against visitor chunks when those chunks are inspected manually (size-weighted heuristic; the editor stub is bundled only `serve`, verified by `npm run build` followed by `grep -R "MuseumEditorStub" apps/museum/.svelte-kit/output/chunks/ | wc -l` returning ≥ 1). Concretely: only the `/dev/museum-editor` route imports any of `package-importer`, `package-exporter`, `binary-texture-store`, `project-export-store`, or `fflate`. The visitor route `/museum` does not.

## Architecture

### Package format — `.museumpack.zip`

Top-level entries (fixed layout):

```
museumpack.zip
├── museum-scene.json     rewritten canonical v6 document
├── manifest.json         package metadata + texture inventory
└── textures/
    ├── <sanitized-1>.png
    ├── <sanitized-2>.webp
    └── ...
```

#### `manifest.json`

```json
{
  "package": {
    "id": "package-<deterministic>",
    "formatVersion": 1,
    "schemaVersion": 6,
    "createdAt": "2026-08-07T18:30:00.000Z",
    "generator": "museum-editor-5.4",
    "documentTitle": "museum-scene"
  },
  "textures": [
    {
      "assetId": "walnut-wall",
      "originalName": "walnut-wall-detail.png",
      "mime": "image/png",
      "size": 245678,
      "fingerprint": "sha256-<hex>",
      "destinationPath": "textures/walnut-wall-detail.png"
    }
  ]
}
```

Invariants:

- `textures.length` matches the count of `SceneTextureAsset.uri` entries in `museum-scene.json` whose URI starts with `/textures/<packageId>/`.
- For every entry: `destinationPath` exists in the archive; `fingerprint` matches the unpacked bytes; `mime` matches the bytes' sniffed MIME.
- `package.id` is `package-<hex>` where `<hex>` is the first 12 hex characters of `sha256(sortedFingerprints.join(''))`. Fingerprints in `manifest.textures` are sorted lexicographically before concatenation. Two packages containing the same texture set produce the same `id`; ordering of entries does not matter.
- `schemaVersion: 6` is enforced.
- `formatVersion: 1` is the only supported version for this slice; rest reject.

#### Sanitization rules

- Original filename kept verbatim so long as it matches `^[A-Za-z0-9._-]{1,128}$`. Otherwise:
  - lowercase;
  - replace runs of non-`[A-Za-z0-9._-]` with `_`;
  - collapse repeated `_`;
  - ensure leading `[A-Za-z0-9]` (prepend `_` if not);
  - truncate to 128 characters.
- Extension is normalized to `.png`/`.webp`/`.jpg`/`.jpeg` based on sniffed MIME; mismatched declared MIME overrides the filename extension on import (manifest writes the sniffed MIME).
- Collision handling: append `-2`, `-3`, … before the extension until unique within `textures/`.

#### URI rewrite

For each unique texture in the document:

1. Compute the rewritten URI as `/textures/<packageId>/<sanitizedFilename>`.
2. Replace `SceneTextureAsset.uri` in `museum-scene.json` with the rewritten URI.
3. Write the bytes under the relative path `textures/<sanitizedFilename>` inside the archive.
4. Build one `manifest.textures` entry per asset.

Project-relative URIs (`/textures/wood-walnut/map.png`) that the user did not change flow through the SAME rewrite — i.e., the editor copies them into the package if they are referenced, so packages are self-contained even for catalogue-derived textures. (The contributor supplies the bytes; the editor reads the file at the URI through `fetch` from the static path.)

### Import path — `editor/import/package-importer.ts`

Pure functions (testable in node) plus a thin browser-only glue that calls `fflate.unzip`.

```ts
export type PackageImportResult =
  | { status: 'ok'; document: MuseumSceneDocument; binaries: Map<string, { bytes: Uint8Array; mime: string; fingerprint: string }>; packageId: string }
  | { status: 'rejected'; reason: 'format-unsupported' | 'manifest-mismatch' | 'missing-bytes' | 'fingerprint-mismatch' | 'unsafe-uri' | 'schema-mismatch'; detail: string };

export function inspectPackage(zip: Uint8Array): Promise<PackagePreview>;
export function importPackage(zip: Uint8Array, opts?: { now?: () => Date }): Promise<PackageImportResult>;
```

`importPackage` must:

- Unzip via `fflate.unzip`.
- Reject if `museum-scene.json` or `manifest.json` is absent.
- Validate `museum-scene.json` through `scene-codec.ts` strict v6 parse; non-v6 → `'schema-mismatch'`.
- Validate `manifest.package.schemaVersion === 6` and `formatVersion === 1`; otherwise `'format-unsupported'`.
- Walk `manifest.textures`. For each entry, read the bytes by `destinationPath`. Verify SHA-256 fingerprint against the bytes. Sniff MIME. Reject on mismatch (`'fingerprint-mismatch'` / `'missing-bytes'`).
- Verify every rewritten URI in `museum-scene.json` corresponds to exactly one manifest entry. Reject if any do not (`'manifest-mismatch'`).
- Reject if `museum-scene.json` references a `SceneTextureAsset.uri` whose path leaves `/textures/<packageId>/` and the manifest does not list it.
- Walk all `SceneTextureAsset.uri` values through `isSafeTextureUri`; reject if any fail (`'unsafe-uri'`).
- On `'ok'`, return the canonical document + a binary-by-rewritten-URI Map (NOT yet turned into object URLs — that's the binary store's job).

### Export path — `editor/export/package-exporter.ts`

```ts
export type PackageExportInput = {
  document: MuseumSceneDocument;
  resolveBytesByUri: (uri: string) => Promise<Uint8Array | null>;
};

export type PackageExportResult =
  | { status: 'ok'; zip: Uint8Array; manifest: PackageManifest; filename: string }
  | { status: 'rejected'; reason: 'unresolved-binary' | 'unsafe-uri' | 'schema-mismatch'; detail: string };

export async function buildPackage(input: PackageExportInput): Promise<PackageExportResult>;
export function packageFilename(document: MuseumSceneDocument, now: Date): string; // e.g. `museum-scene-<yyyyMMdd-HHMM>.museumpack.zip`
```

`buildPackage` must:

- Strict-validate the document is v6 canonical. Reject on `'schema-mismatch'`.
- Walk every `SceneTextureAsset.uri`. For each:
  - Compute the rewritten URL/path.
  - Resolve bytes via the caller-supplied resolver. The resolver kicks in this order:
    1. Binary store (`session-state`).
    2. Project-relative URI fetched via `fetch(uri)` from the editor runtime.
    3. Otherwise reject `'unresolved-binary'` with a list of unresolved URIs.
- Sanitize filenames, dedup collisions.
- Compose `manifest.json`.
- Compose `museum-scene.json` with rewritten URIs.
- Write ZIP via `fflate.zip`. Use `fflate.ZipPass` for streaming on large textures; default sync for ≤ 4 MB total.
- Return the resulting `Uint8Array` plus suggested filename.

Resolver injection (rather than global) keeps the export pure for testing.

### Binary session store — `editor/store/binary-texture-store.svelte.ts`

```ts
export type BinaryTextureEntry = {
  bytes: Uint8Array;
  mime: string;
  fingerprint: string; // sha256 hex
  objectUrl: string | null;
};

export class BinaryTextureStore {
  // private Map<uri, BinaryTextureEntry>;
  register(uri: string, bytes: Uint8Array, mime: string): Promise<{ fingerprint: string }>;
  has(uri: string): boolean;
  resolve(uri: string): Promise<Uint8Array>;          // returns the bytes
  objectUrlFor(uri: string): string | null;          // lazily creates and registers
  clearExcept(retainUris: ReadonlySet<string>): void; // prunes unreferenced entries + revokes URLs
  releaseAllObjectUrls(): void;                      // sweeps all ever-issued URLs
  pendingObjectUrls(): ReadonlySet<string>;
}
```

Object URL lifecycle lives here. Every `URL.createObjectURL` is recorded on the session-state `pendingObjectUrls` set and removed on revoke. The store calls `releaseAllObjectUrls` on:

- Project → Reset
- Project → Import (JSON or Package)
- Document swap inverse (rare; covered by session-state sweep)
- Page unload (`onDestroy` of `MuseumEditorApp.svelte`)
- Test teardown

Plus, when a texture inside the document is **removed** (e.g. via Undo past the registration), `clearExcept` is called against the post-mutation URI set.

### Source loader edit — `museum/materials/texture-cache.ts`

```ts
export type TextureSourceLoader = (
  uri: string,
  slot: MaterialTextureSlot
) => Promise<import('three').Texture>;

export function setDefaultTextureSourceLoader(
  loader: TextureSourceLoader | null
): void; // test hook; null restores the built-in `fetch`-based loader

export function loadSourceTexture(
  uri: string,
  slot: MaterialTextureSlot
): Promise<import('three').Texture>;
```

Phase 5.3 specified `loadSourceTexture` as an exported function. 5.4 keeps that and teaches it to dispatch:

1. If a global `TextureSourceLoader` hook is registered (test path), delegate to it.
2. Otherwise: check `BinaryTextureStore.has(uri)`. If yes, build a `THREE.Texture` from the in-memory bytes via `TextureLoader.load(URL.createObjectURL(...))` and register the URL with `pendingObjectUrls` via `BinaryTextureStore.objectUrlFor(uri)`.
3. Otherwise: read from public path via `fetch` (current Phase 5.3 behaviour).

This keeps `SceneInstanceMaterial`, `EntityPrimitive`, and `AssetModel` exactly as Phase 5.3 wrote them. They only see that the URI "loads." Vertically they cannot tell whether the bytes were fetched from disk or pasted from memory.

### Plain-JSON export gate — `editor/store/project-export-store.svelte.ts`

```ts
export type ProjectExportBlocker = {
  unresolvedTextures: SceneTextureAsset[];
};

export function computeProjectExportBlocker(
  document: MuseumSceneDocument,
  binaryStore: BinaryTextureStore
): ProjectExportBlocker | null;
```

`null` ⇒ unblocked. Non-null ⇒ project can only export as a package.

Project menu reads this and renders:

- `Copy JSON` / `Download JSON` → disabled with tooltip listing unresolved texture IDs.
- `Export Package…` → enabled always.
- A small chip in the top bar: "N unresolved texture(s)" when blocker.N > 0, ugly but specific.

`compatibility guard`: even when no textures are unresolved, the project menu keeps the explicit Export Package action so users do not need to depend on the implicit JSON path.

### Editor UI

#### Textures library — `EditorAssetLibrary.svelte`

Add a drop target alongside the existing register form:

- `<input type="file" accept="image/png,image/webp,image/jpeg">` (form use `multiple`).
- Drop zone over the panel: accepts files dropped from desktop. Drag-over highlight.
- On file add: read bytes, sniff MIME via magic bytes (`89 50 4E 47`, `52 49 46 46…WEBPVP`, `FF D8 FF`), reject if not in `image/png` / `image/webp` / `image/jpeg`.
- On success: pre-fill Register form `Name` (from filename stem) and a session marker (NOT a public URI) for the bytes.
- The Register form gains a `Source` toggle: `Public URI` (existing) vs `Local file` (new). Local file uses session binary path.
- Once registered via Local file, the texture entry shows `(local)` next to the asset ID, and "needs package on plain JSON export" status.

#### Inspector — `EditorMaterialInspector.svelte`

No new fields; the texture assignment already shows the resolved texture by URI. Add a small chip near the texture picker: "Local — requires package on save" when the URI is binary-only.

#### Project menu — `EditorProjectMenu.svelte`

- New `Export Package…` action.
- `Copy JSON` / `Download JSON` re-read the blocker every render and disable themselves when blocked.
- Icon-only badge in the top bar (existing Project button row) showing unresolved count.

#### Status bar

Read `computeProjectExportBlocker(...)` from the existing status row. If non-null, render: `1 unresolved texture — Export package to save` with a click-to-call `Export Package…`.

### Reduced motion + accessibility

- Drag-over state has both color and a textual label change ("Drop textures to import") so screen readers don't rely on color alone.
- Form errors are announced via existing role=alert regions.
- Object URLs are not exposed in attribute names. UI never surfaces `blob:http://…` URLs.
- `aria-describedby` connects each binary tag in the inspector to the chip's explanation so screen readers say e.g. "Walnut Wall, local, requires package on save."

## Components / files

| File | Type | Purpose |
|------|------|---------|
| `content/package-format.ts` | new | shared manifest + format constants; pure types |
| `content/package-format.test.ts` | new | serialization of manifest, schema validation, sanitization |
| `museum/materials/texture-cache.ts` | modified | add binary dispatch + `setDefaultTextureSourceLoader` hook |
| `museum/materials/texture-cache.test.ts` | modified | add describes for binary-store path + dispatcher |
| `editor/import/package-importer.ts` | new | fflate unzip + manifest validation + safe-URI pass |
| `editor/import/package-importer.test.ts` | new | accepts/rejects matrix, fingerprint verification, schemas |
| `editor/export/package-exporter.ts` | new | fflate zip writer + URI rewrite + resolver injection |
| `editor/export/package-exporter.test.ts` | new | rejects without bytes, fingerprint set, gentle collisions |
| `editor/store/binary-texture-store.svelte.ts` | new | bytes register/resolve/revoke lifecycle |
| `editor/store/binary-texture-store.test.ts` | new | register, prune-on-clearExcept, revoke-on-reset/release |
| `editor/store/project-export-store.svelte.ts` | new | blocker computation, derive store |
| `editor/store/project-export-store.test.ts` | new | null when resolved, populated when not, idempotent |
| `editor/EditorAssetLibrary.svelte` | modified | Drop zone + Source toggle + binary register path |
| `editor/EditorProjectMenu.svelte` | modified | Export Package action + gate copy/download JSON |
| `editor/MuseumEditorApp.svelte` | modified | wire `pendingObjectUrls` sweep on unmount |
| `editor/museum-editor.svelte.ts` | modified | host `BinaryTextureStore` on the store facade |
| `editor/EditorMaterialInspector.svelte` | modified | chip when assigned texture is binary-only |
| `package.json` | modified | add `fflate` to `apps/museum/devDependencies`, pin major |
| `vite.config.ts` | unchanged | `optimizeDeps.include` does not need fflate (it's ~10 KB unminified); revisit if dev cold-starts add ≥200 ms |
| `editor/texture-verifier.ts` | unchanged | still uses `isSafeTextureUri` + `loadSourceTexture`; binary path goes through the latter |

`package-importer.ts` and `package-exporter.ts` live behind the editor entry plugin. Phase 5.4 must not lift them into a non-editor path. The vite plugin gate (`museum-editor-entry-plugin.ts`) already includes `MuseumEditorApp.svelte` only for `serve`; fflate is then a transitive dev-only import for the visitor.

## Data flow

### Register a binary texture

```
EditorAssetLibrary drop / file input
  → sniff MIME from bytes
  → triage against allowed list
  → BinaryTextureStore.register(sessionUri, bytes, mime)
       → sha256(bytes) → fingerprint
       → map session URI → entry
  → Store facade.registerBinaryTexture
       → re-resolve store before commit
       → beginDocumentTransaction
       → append SceneTextureAsset (uri = session URI under rewritten slot)
       → commitDocumentTransaction
  → UI: card with thumbnail (from createObjectURL of the bytes), label "(local)"
```

### Export a package

```
EditorProjectMenu "Export Package…"
  → computeProjectExportBlocker(document, binaryStore) === null → green
  → package-exporter.buildPackage({ document, resolveBytesByUri })
       → for each SceneTextureAsset.uri:
           binaryStore.has(uri)      → bytes = store.bytes
           else if public path OK   → bytes = await fetch(uri).then(r => r.arrayBuffer()).then(toBytes)
           else                     → reject 'unresolved-binary'
       → sanitize filenames; build manifest; rewrite JSON
       → fflate.zip → Uint8Array
  → createObjectURL on the ZIP (record on pendingObjectUrls)
  → trigger <a download> from a temp anchor
  → setTimeout → URL.revokeObjectURL (and clear from pendingObjectUrls set)
```

### Import a package

```
EditorProjectMenu "Import Package…" (file/zip input)
  → package-importer.importPackage(zip)
       → fflate.unzip
       → parse + validate museum-scene.json (scene-codec strict v6)
       → parse + validate manifest.json (formatVersion=1, schemaVersion=6)
       → per-entry: sha256(bytes) === manifest.fingerprint; MIME sniff matches
       → URI rewrite validation: every /textures/<packageId>/... in JSON corresponds to exactly one manifest entry
       → reject otherwise
  → store.reset() / clearExcept({})
  → BinaryTextureStore pre-register each texture's bytes into a fresh session URI keyed off the rewritten URI in the JSON
  → store facade.commitDocumentFromImport(document)
       → standard import flow applies (validator run, history cleared, selection cleared)
  → release object URLs allocated during paste
```

### Plain-JSON export gate

```
store has importBlocker === null                  → unblocked
store has importBlocker === { unresolvedTextures } → Copy JSON / Download JSON disabled
always                                            → Export Package enabled
```

### Object-URL hygiene

- Every `URL.createObjectURL(...)` call site runs through a thin helper inside `binary-texture-store.svelte.ts` (`acquireObjectUrl`). The helper:
  - calls `URL.createObjectURL(blob)`;
  - inserts the URL into `session-state.pendingObjectUrls`;
  - returns the URL.
- `releaseObjectUrl(url)` removes from `pendingObjectUrls` and calls `URL.revokeObjectURL`.
- `releaseAllObjectUrls()` enumerates `pendingObjectUrls` and releases each.
- Sweep fires on: Project → Reset; Project → Import (any kind); Page unload via `onDestroy` of the editor app; test teardown via `resetTextureCachesForTests` (extended to also sweep object URLs).
- Texture pruning on document mutation: `clearExcept(remainingUris)` after every mutation that may orphan texture entries.

## Error handling

| Failure | Path | Visible effect |
|---|---|---|
| Unsupported MIME on file input | import | banner: "Walnut detail.png was not a supported image (got application/octet-stream)" |
| Unsupported format version | import | toast: "Package was made by a newer editor" |
| Schema version mismatch | import | toast: "Package schema not supported here" |
| Bad fingerprint | import | toast: "Package tampered with or corrupted" |
| Unsafe URI in JSON | import | toast: "Package references an unsafe URI" |
| Missing bytes | import | toast: "X declared textures are missing from the package" |
| Manifest mismatch | import | toast: "Package contents don't match its manifest" |
| Plain JSON export blocked | export | Copy JSON / Download JSON disabled with tooltip listing unresolved entries |
| Failed ZIP compression | export | toast: "Could not build package" |
| Unresolved bytes during export | export | "unresolved-binary" with the list; user must register the binary or remove the reference |
| Object URL leak | runtime | vitest sweep catches it in tests; runtime page-unload `onDestroy` releases all |
| Concurrent binary import on the same URI | store | First writer wins; second writer's `register` resolves the same fingerprint on success; differing bytes reject |
| Bad rename collision | export | deterministic `-N` suffix; deterministic across runs for the same input |

## Locked invariant — URI and the cache

After this slice:

1. Texture cache (`loadSourceTexture`) is the only ingestion point. Visitor/editor paths converge.
2. Both public URIs (fetch) and binary URIs (memory) resolve through `loadSourceTexture`. The variant pool mechanics from Phase 5.3 are unchanged.
3. `SceneTextureAsset.uri` is always a safe absolute path of the form `/textures/...` — never `blob:`.
4. Binary bytes never enter canonical JSON. Canonical JSON only carries URIs.

## Testing

### `package-format.test.ts`

- Manifest: round-trips through `JSON.stringify` + `JSON.parse`.
- Filename sanitization: normal/mixed-case/non-ascii/long/leading dot/empty.
- Collision: deterministic suffix.
- Format version check: rejects `formatVersion: 2`.

### `texture-cache.test.ts` (extension)

- `loadSourceTexture` with a stub `TextureSourceLoader` invoked (test path).
- `loadSourceTexture` with a binary registered URI resolves to an in-memory `THREE.Texture` and records an object URL on `pendingObjectUrls`.
- Dispatcher fallback to `fetch` when neither stub nor entry is present.
- Object URL bookkeeping round-trip.

### `package-importer.test.ts`

- Accepts a minimal valid `.museumpack.zip` produced by the exporter.
- Rejects: missing `museum-scene.json`, missing `manifest.json`, wrong `formatVersion`, wrong `schemaVersion`, missing bytes, fingerprint mismatch, unsafe URI inside rewritten JSON.
- URI pass: rewritten `/textures/<packageId>/...` correspond to manifest entries.
- MIME sniff on zip bytes vs declared MIME.

### `package-exporter.test.ts`

- Rejects when `resolveBytesByUri` returns `null` for any `SceneTextureAsset.uri`.
- Rewrites URIs deterministically for the same input fingerprint set.
- Filename sanitization + collision suffix.
- `fetch`-then-bytes path when no binary is registered.
- Returns a `Uint8Array` whose `fflate.unzip` round-trip yields identical bytes.

### `binary-texture-store.test.ts`

- Register same bytes twice ⇒ same fingerprint.
- Two distinct byte batches ⇒ different fingerprints.
- `clearExcept` revokes URLs for dropped entries.
- `releaseAllObjectUrls` empties `pendingObjectUrls`.
- Object URL helper is the only call site for `URL.createObjectURL`.

### `project-export-store.test.ts`

- Empty document → blocker `null`.
- Local + public textures → blocker `null`.
- Local-only texture → blocker with one entry.
- Update docs → blocker updates.

### Browser smoke

- Drag an image file from desktop onto the Textures library panel → registers instantly, renders a thumbnail, retries after a corrupt file.
- After registration, drag the texture onto a primitive, viewport swaps within one frame (existing Phase 5.3 behavior unchanged).
- Click `Export Package…` → single `.museumpack.zip` downloads. Re-import into a clean /Reset editor → scene + assignment match exactly.
- Save a project that includes only **local** textures → `Copy JSON` / `Download JSON` are disabled with tooltip. Click `Export Package…` → succeeds. Re-import → identical restore.
- Reload the page with one local texture in memory → no orphan object URLs (DevTools console reflects cleanup on unload).
- Round-trip: same exported + re-imported package ⇒ identical `museum-scene.json` content (string-equal after deep canonical serialization).

### Vitest + svelte-check + build

- `npm run check -w @portfolio/museum`: 0 errors / 0 warnings.
- Vitest: prior 675 tests still pass + new tests land around ≈ 750.
- `npm run build -w @portfolio/museum`: exits 0; bundle size grows by ≈ 12 KB raw, ≈ 4 KB gz after fflate minification.

## Acceptance gate

1. A user can drop a PNG/JPG/WEBP file into the Textures library and it renders + assigns to entities.
2. Plain-JSON export is blocked when any registered texture is binary-only.
3. Export Package produces a single `.museumpack.zip` whose contents cover every texture in the document.
4. Import Package produces the same document, the same assignments, and the same render as the exported state.
5. Object URLs are never leaked across: Reset, Import, page unload, document swap, expire-after-prune.
6. Reloading the page after a load that left local textures registered does not leak object URLs.
7. Visitor routes still consume `/museum` exactly as before; no ZIP code path appears in the production visitor chunk graph.
8. Drop-on-texture-card and drop-on-primitive continue to work after this slice (Phase 5.3 behavior preserved).
9. Catalogue-only textures still pass through Package export (passed via `fetch`), so packages remain reproducible.
10. svelte-check / vitest / build all green; no new error or warning enums; one new dependency (`fflate`).

## Files

Expected new files:

- `apps/museum/src/lib/content/package-format.ts`
- `apps/museum/src/lib/content/package-format.test.ts`
- `apps/museum/src/lib/editor/import/package-importer.ts`
- `apps/museum/src/lib/editor/import/package-importer.test.ts`
- `apps/museum/src/lib/editor/export/package-exporter.ts`
- `apps/museum/src/lib/editor/export/package-exporter.test.ts`
- `apps/museum/src/lib/editor/store/binary-texture-store.svelte.ts`
- `apps/museum/src/lib/editor/store/binary-texture-store.test.ts`
- `apps/museum/src/lib/editor/store/project-export-store.svelte.ts`
- `apps/museum/src/lib/editor/store/project-export-store.test.ts`

Expected modified:

- `apps/museum/src/lib/museum/materials/texture-cache.ts` (binary dispatch + `setDefaultTextureSourceLoader` hook)
- `apps/museum/src/lib/museum/materials/texture-cache.test.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorProjectMenu.svelte`
- `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/MuseumEditorApp.svelte`
- `apps/museum/package.json` (add `fflate`)
- `package-lock.json`

## Handoff to Phase 5.5

Phase 5.5 is browser/production verification — it picks up where 5.4 finishes, runs the manual test runbook from the editor preview tab, and verifies editor/visitor parity for both project-relative and binary textures packaged together. 5.5 must not pull forward any cache or renderer refactoring beyond what 5.3 plus 5.4 produce.
