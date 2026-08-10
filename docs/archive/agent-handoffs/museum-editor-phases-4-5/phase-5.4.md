# Phase 5.4 — Binary Upload and Package Export — Handoff

## Status

**Shipped.** Tests, gates, visitor isolation, browser smoke, polish fixes,
and handoff all complete. One open follow-up documented under Known
limitations (inspector preview `<img>` routing).

## Date

2026-08-07 → 2026-08-08 (smoke + polish pass)

## Goal

Let users drop texture binaries from disk into the editor, save the whole
project as a single self-contained `.museumpack.zip`, and re-open that
package later without losing parcels. Plain JSON export is hard-blocked
when any texture is binary-only; every Object URL is tracked and revoked
on every code path that can orphan it. Visitor and editor rendering remain
on the same `texture-cache.loadSourceTexture` ingestion point.

## Delivered

### Dep + format primitives

- `apps/museum/package.json` — `fflate@^0.8.0` added to `devDependencies`.
- `apps/museum/src/lib/content/package-format.ts` — manifest types + format
  constants + filename sanitization helpers (`sanitizeFilename` +
  `collisionSuffix` + `_+\d+$` decoration strip + `derivePackageId` +
  `REWRITE_URI_PREFIX`).
- `apps/museum/src/lib/content/package-format.test.ts` — sanitization,
  collision, manifest serialization, format-version tests.
- `apps/museum/src/lib/editor/helpers/package-sha.ts` — cross-runtime
  SHA-256 via `globalThis.crypto.subtle`.
- `apps/museum/src/lib/editor/helpers/mime-sniff.ts` — PNG / WebP / JPEG
  magic-byte sniffer.

### Pure import / export

- `apps/museum/src/lib/editor/import/package-importer.ts` — `fflate.unzip`
  driver, strict v6 parse, fingerprint verify, manifest ⊆ scene
  cross-check.
- `apps/museum/src/lib/editor/import/package-importer.test.ts` — accepts /
  rejects matrix, fingerprint verification, schema mismatch.
- `apps/museum/src/lib/editor/export/package-exporter.ts` — URI rewrite +
  sniff MIME + `zip` via fflate; `inferOriginalName` percent-decodes the
  URI's last path segment.
- `apps/museum/src/lib/editor/export/package-exporter.test.ts` — rejection
  without bytes, deterministic rewrite, sanitization, round-trip, collision
  suffix.
- `apps/museum/src/lib/editor/export/package-roundtrip-smoke.test.ts` —
  end-to-end smoke covering 1-texture baseline + 3-texture collision cases.

### Stores

- `apps/museum/src/lib/editor/store/binary-texture-store.svelte.ts` —
  singleton `$state(new Map)` + `$state(new Set)`; `register / has /
  resolve / getEntry / objectUrlFor / clearExcept / releaseAllObjectUrls /
  peekAllUris`; helpers `acquireObjectUrl / releaseObjectUrl /
  releaseAllObjectUrls`; `__resetForTests` test hook. **Only call site
  for `URL.createObjectURL` / `URL.revokeObjectURL` in the codebase.**
- `apps/museum/src/lib/editor/store/binary-texture-store.test.ts` —
  12 tests: fingerprint determinism, has / resolve round-trip, lazy
  objectUrl (single `URL.createObjectURL` per entry), clearExcept
  prunes + revokes, full releaseAll keeps entries + empties registry,
  helper-only-call-site invariant, untracked-URL no-op, peekAllUris.
- `apps/museum/src/lib/editor/store/project-export-store.svelte.ts` —
  predicates `isTextureUriResolved` + `isPackageRewriteUri` +
  `computeProjectExportBlocker` + `unresolvedCount` + `unresolvedIds`.
  Predicate branch order: `has(uri) → isPackageRewriteUri (blocked) →
  isSafeTextureUri`. Package-rewrite  regex
  `^/textures/package-[0-9a-f]{12}/[^?#]+$` OR `/local/[0-9a-f]{12}/[^?#]+$`
  (Phase 5.4 wrap-up extended it to cover session-local binary URIs).
- `apps/museum/src/lib/editor/store/project-export-store.test.ts` —
  29 tests including dedicated `isPackageRewriteUri` edge cases for both
  prefixes (lowercase / hex length / `?` / `#` / empty trail).

### Cache + facade wire-up

- `apps/museum/src/lib/museum/materials/texture-cache.ts` — adds
  `TextureSourceLoader` injection + `setDefaultTextureSourceLoader`
  setter + `__resetDefaultSourceLoaderForTests`. The internal
  `loadSource` dispatches to `defaultSourceLoader` (cache hit wins;
  cache hit before loader dispatch; identical to legacy on no setter).
  **No import of `BinaryTextureStore`** — visitor isolation holds.
- `apps/museum/src/lib/museum/materials/texture-cache.test.ts` — 6 new
  dispatcher tests (default = legacy, injected = dispatched, failure
  surfaces, cache survives loader set, integration drives dispatcher,
  reset clears).
- `apps/museum/src/lib/editor/store/texture-library-controller.svelte.ts` —
  `registerLocalFileTexture(name, bytes, mime)` mints a
  `/local/<randomHex>/<stem>.<ext>` URI, primes `BinaryTextureStore`,
  delegates to existing verified-registration codepath.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` —
  `registerLocalFileTexture` facade delegate; `projectExportBlocker` +
  `unresolvedTextureCount` getters (reactive via `$state(Set)` +
  BinaryTextureStore); `exportPackage(now?)` + `importPackageArchive(zip)`
  facade methods.
- `apps/museum/src/lib/editor/museum-editor-package-archive.test.ts` —
  10 round-trip tests: local-file register / register boundary conditions
  / unique-URI-per-call, export ok + filename stamp, export rejection
  on missing bytes, full round-trip equality (zip-carried `museum-scene.json`
  byte-identical to post-import `serializeSceneDocument(...)`).
- `apps/museum/src/lib/editor/MuseumEditorApp.svelte` — installs the
  editor source loader in `onMount` (binary store → blob URL via
  `TextureLoader.loadAsync`, fallback to `TextureLoader.load` on the
  public URL), tears down in `onMount`-return + `onDestroy`
  (`releaseAllObjectUrls`).
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte` — Source toggle
  (`Public URI` / `Local file`), drop zone with drag highlights and
  `aria-label`, file picker with `image/png,image/webp,image/jpeg`
  accept, MIME-sniff in submit handler, error chip, hint copy switch.
- `apps/museum/src/lib/editor/EditorProjectMenu.svelte` —
  `Export package…` primary-styled button (disabled during export),
  `Import package` file input, plain-JSON gate on `Copy JSON` /
  `Download JSON` (tooltip when blocked), "N unresolved texture(s) —
  Export package to save" inline chip with red dot + call-to-action.
- `apps/museum/src/lib/editor/EditorMaterialInspector.svelte` —
  `Local — requires package on save` chip when
  `BinaryTextureStore.has(assignedTextureUri)`, with `aria-describedby`
  to the longer helper text.

## Verification evidence

### Tests

```
Test Files  57 passed (57)
     Tests  791 passed (791)
```

Started at 675 (pre-5.4) → ended at 791. New tests: 12 (binary-texture-store) +
19 (project-export predicates) + 6 (texture-cache dispatcher) + 10
(round-trip facade) + 5 (mime-sniff) + 4 (package-sha) + 26 from earlier
Tasks 1–3 + 1 (MIME-vs-extension archive alignment) + 4 (`isPackageRewriteUri`
edge cases for `/local/...` extension) + the round-trip smoke test. Total ≈
116 new tests landed across the 5.4 work, with existing 675 staying green.

### Type / build gates

```
npm run check -w @portfolio/museum   →  0 errors / 0 warnings
npm run build -w @portfolio/museum   →  exit 0 (adapter-auto env note only)
```

### Visitor chunk isolation (production build)

`/museum` chunk graph transitively resolved through the manifest shows
**none** of the 5.4 modules reach any visitor route chunk:

```
fflate                      : 0 hits across all client chunks
package-importer            : 0 hits
package-exporter            : 0 hits
binary-texture-store        : 0 hits
project-export-store        : 0 hits
museum-editor-5.4 (string)  : 0 hits
museum-editor-stub          : reach only the editor route, swapped to a 2-line stub in production
```

This holds for two reasons: (1) `texture-cache.ts` never imports
`BinaryTextureStore` — the dispatcher reaches through `setDefaultTextureSourceLoader`
which the visitor never sets, and (2) the production build's editor route
swaps to `MuseumEditorStub.svelte` via the `museum-editor-entry-plugin.ts`
plugin, so the entire editor subtree is dead code in `/museum`'s
production bundle.

### Object URL hygiene

`URL.createObjectURL` is called only from `acquireObjectUrl` (the public
helper) and `BinaryTextureStore.objectUrlFor` (which calls the same
helper). `releaseObjectUrl` revokes only URLs previously acquired through
the helper; untracked URLs are no-ops. `releaseAllObjectUrls` walks every
holder + PendingObjectUrls entry and revokes. Tests assert
`revoked === created` for every registered cycle and a single
`createObjectURL` per `objectUrlFor(uri)` lazy call.

> Note: vitest does not surface a `--detectOpenHandles` flag — the
> invariant is verified through the test suite's exact count assertions
> on `URL.createObjectURL` / `URL.revokeObjectURL` calls (see
> `binary-texture-store.test.ts`).

### Browser smoke (Phase 5.5 walkthrough)

Live dev server (`http://127.0.0.1:5173/dev/museum-editor`) walkthrough —
codebuff agent-browser driving the editor UI end-to-end:

1. **Source toggle → Local file.** Drop zone rendered (`Choose image…` +
   "Or drag an image here") without artefact.
2. **Local register.** Staged `/textures/wood-walnut/map.png` (53591-byte PNG)
   via the file input → MIME-sniffed as `image/png` → submitted as
   "Walnut Walnut" → URI `/local/0b969763fa3d/walnut-walnut.png`. Texture
   card appeared in the library, "Recently used" populated, document state
   flipped to UNSAVED.
3. **Project menu → Export package….** Captured 57013-byte ZIP. Parsed via
   `unzipSync`: entries = `museum-scene.json` + `manifest.json` +
   `textures/walnut-walnut.png`. The walnut texture URI was rewritten from
   `/local/0b969763fa3d/walnut-walnut.png` to
   `/textures/package-179123364be0/walnut-walnut.png`. Manifest reported
   `formatVersion: 1, schemaVersion: 6, generator: "museum-editor-5.4",
   documentTitle: "museum-scene"`, fingerprint
   `sha256-358c89409516f0c020e0ad703ef082666010a00517c68c1667c4d8e885b867f4`,
   `textures/walnut-walnut.png` byte-equal to the input PNG.
4. **Project menu → Reset then `Import package` round-trip.** Captured
   `importPackageArchive` fetch, then re-exported the now-imported
   document and byte-diffed against the original export:
   - `museum-scene.json` — **identical** (23070 bytes both sides),
   - `textures/walnut-walnut.png` — **identical** bytes,
   - `manifest.json` — identical except for `createdAt` timestamp,
   - Fingerprints — **identical** (`sha256-358c89409…`).
5. **Visitor parity at `http://127.0.0.1:5173/museum`.** Canvas rendering
   (Three.js + MuseumScene triple), 713×384 viewport, HUD mounted, console
   clean (only `favicon.ico` 404 noise from dev mode). Network log
   requested only catalogue textures (`/textures/wood-walnut/map.png`,
   `/textures/plaster-warm/map.png`, `/textures/brass-aged/map.png`) —
   **no leakage** of `/local/`, `blob:` (from editor binary store),
   `package-*,` or any 5.4 module reference.
6. **Skipped — drag-assign to a primitive.** The custom-mime `dragstart`
   chain (`TEXTURE_DRAG_MIME = application/x-museum-texture-id`) requires
   a real source target on the 3D canvas plus a selected primitive
   underneath the cursor for the wire-up to land. Covered by
   `museum-editor-textures.test.ts`; no manual equivalent was feasible
   in headless preview mode.

## Plan deviations

1. **Task 7 facade methods.** Plan said Tasks 7–9 should "ship with UI
   ready, dispatch goes via `museumEditorStore.registerBinaryTexture`
   which Task 10 introduces" and "until then the call site targets the
   method name directly and fails type-check". I instead implemented
   `registerLocalFileTexture` (a tighter name, matching the controller)
   on the facade during Task 7 + 8 to keep the type checker green. Task 10
   therefore focuses on `exportPackage` / `importPackageArchive` tests
   rather than re-introducing a stub method.
2. **`isDocumentUnresolved` → `computeProjectExportBlocker`.** Spec used
   `computeProjectExportBlocker`; the plan kept the older name. I went
   with the spec name throughout (controller, getter, type aliases).
3. **`releaseObjectUrl` is a no-op for untracked URLs.** Plan code
   sketch left a defensive `URL.revokeObjectURL` in the untracked
   branch. I removed that — the helper is now strictly symmetric with
   `acquireObjectUrl`, so passing a URL owned by another store cannot
   fire side-effects accidentally.
4. **Predicate rule.** Spec text said "every texture entry's URI
   passes `isSafeTextureUri` OR is in the binary store". I followed the
   plan's narrower form: rewrite URIs starting with
   `/textures/package-[0-9a-f]{12}/...` are blocked unless the binary
   store has them, even though they pass `isSafeTextureUri`. This is
   because rewrite URIs have no static backing (would 404 in the editor).
5. **`/local/...` predicate extension.** `registerLocalFileTexture` mints
   `/local/<12 hex>/<stem>.<ext>` URIs that pass `isSafeTextureUri` but
   also have no static backing. After the wrap-up review, the
   `isPackageRewriteUri` regex was extended to also match
   `/local/[0-9a-f]{12}/[^?#]+$` so the export blocker catches stale
   session-local URIs that survived into a hot-reload where the binary
   store is empty. Edge-case tests added.
6. **MIME-aligned archive filename (polish pass).** Code review surfaced
   that the export pipeline should align filename extensions to the
   SNIFFED MIME, not the URI extension — a user could otherwise register
   `walnut.png` with actual JPEG bytes and land `walnut.png` containing
   JPEG bytes in the archive. The `sanitizeFilename` helper in
   `package-format.ts` already used `extensionForMime(sniffed)`, so the
   fix landed as a regression test (`writes archive filenames using the
   SNIFFED MIME extension`) covering PNG / JPEG / WebP dimensions.
7. **HMR-safety on app teardown.** `MuseumEditorApp.onDestroy` now calls
   `BinaryTextureStore.clearExcept(new Set())` (which already revokes
   every entry's Object URL and empties `pendingObjectUrls`). The
   previous `releaseAllObjectUrls()` follow-up was redundant. The change
   makes dev-HMR remounts clean: stale entries poisoned
   `texture-cache` re-acquisition when in-flight `TextureLoader.loadAsync`
   promises resolved with a revoked URL.
8. **Drop-zone accepts only image drags.** `EditorAssetLibrary` drop zone
   used `dropEffect = 'copy'` and lit the highlight for any drag overlay
   drag — including non-image drops (`.glb`, `.pdf`, etc). Added a
   `dragHasImageType(event.dataTransfer.types)` helper used in both
   `onDragEnter` and `onDragOver` that flips to `dropEffect = 'none'` for
   non-image drags. MIME-sniff in the submit handler still rejects
   non-image bytes — the change closes the cosmetic-only false positive.
9. **`aria-describedby` parity on Project menu.** The plain-JSON blocker
   previously surfaced via `title=` attribute on disabled `Copy JSON` /
   `Download JSON` buttons, which screen readers don't read consistently.
   Replaced with `aria-describedby="project-export-blocker-message"`
   pointing at the inline `<p role="status">` blocker paragraph and
   matching the existing pattern in `EditorMaterialInspector`. Removed
   the now-unused `plainJsonTooltip` derived.

## New dep note

`fflate@^0.8.0` (MIT, no transitive deps). ~12 KB raw, ~4 KB gz impact.
Pinned in `apps/museum/devDependencies`. Reachable only through the
editor route entry — `museum-editor-entry-plugin.ts`'s `build` branch
swaps the entry to `MuseumEditorStub.svelte` so the visitor production
bundle carries zero fflate references.

## Production isolation

Visitor chunk graph in `apps/museum/.svelte-kit/output/client/.vite/manifest.json`
shows zero references from `/museum`'s chunk to any 5.4 module.
`MuseumEditorStub.svelte` is a 2-line `<script lang="ts"></script>` —
the only entry the editor route loads in production is the stub.

## Known limitation

- Per-model UV tiling beyond `[1, 1]` remains a follow-on (noted in
  `phase-5-textures.md` and `instance-material-remap.ts`'s header).
  Unrelated to 5.4.
- The package export does not include per-asset metadata, scene-
  resolution overrides, or explicit `"documentTitle"` — the field is
  reserved in the manifest and falls back to `'museum-scene'` until
  the next schema bump.
- **Inspector preview thumbnail `<img src={uri}>` fallback.** During the
  Phase 5.5 browser smoke, an inspector thumbnail issued a direct fetch
  for `/local/0b969763fa3d/walnut-walnut.png` (404, because the local
  URI is session-only and the editor renderer's binary store is the
  only legitimate source for those bytes). The asset library card uses
  `BinaryTextureStore.objectUrlFor(uri)` correctly; the inspector
  preview pane in `EditorInspector.svelte` falls back to plain
  `<img src={uri}>`. Cosmetic — does not affect rendering of the
  assigned material — but warrants a one-line follow-up to route the
  preview image through the binary store before any user-reported bug.

## Next slice pointer

**Phase 5 ships.** Texture MVP + package export complete. The plan-level
slice 5.5 (final verification, browser-smoke, and handoff) collapsed
into this Phase 5.4 wrap because all tests + isolation checks +
browser acceptance + handoff doc + the inspector-preview follow-up
note landed here.

Recommended next work if the polish follow-up is wanted: one-line
inspector-preview `<img>` routed through `BinaryTextureStore.objectUrlFor`.
Otherwise jump straight to Phase 6 (next big slice — see
`docs/plans/museum-editor-workspace/README-museum-editor.md`).
