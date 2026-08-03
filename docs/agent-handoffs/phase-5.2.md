# Phase 5.2 — Texture library and assignment

**Status:** Complete  — all nine tasks landed and gated 2026-08-03
**Parent plan:** [`../plans/museum-editor-workspace/phase-5-textures.md`](../plans/museum-editor-workspace/phase-5-textures.md) slice 5.2
**Design:** [`../superpowers/specs/2026-08-02-phase-5-2-texture-library-assignment-design.md`](../superpowers/specs/2026-08-02-phase-5-2-texture-library-assignment-design.md)
**Implementation plan:** [`../superpowers/plans/2026-08-02-phase-5-2-texture-library-assignment.md`](../superpowers/plans/2026-08-02-phase-5-2-texture-library-assignment.md)

## Goal

Register stable root-relative public texture URIs, browse/search them in the editor, and assign them atomically to model or primitive entities through the canonical v6 texture/material schema — without pulling Phase 5.3 rendering/cache work forward.

## Delivered

### Task 1 — Shared texture URI policy

- `apps/museum/src/lib/content/texture-uri.ts` — extracted `isSafeTextureUri` (root-relative, no protocols/`//`/traversal/encoded traversal/backslashes/query/fragment).
- `scene-codec.ts` imports the shared predicate; private duplicate removed.
- Direct policy tests + retained codec `unsafe_texture_uri` coverage.

### Task 2 — Pure library / assignment helpers

- `apps/museum/src/lib/editor/editor-textures.ts`: `TEXTURE_DRAG_MIME`, `filterTextureLibraryItems`, `resourceIdBase`/`reserveResourceId`, `materialInstanceUsageCount`, `orderRecentlyUsedTextures`, `firstRenderablePlacementId`, patch/share/decision types.
- Unit-covered (search, slugs, suffixes, usage, recents, drop-target resolution, stale/light rejection).

### Task 3 — Retryable editor-only image verifier

- `apps/museum/src/lib/editor/texture-verifier.ts`: `loadBrowserTextureImage` (async decode), `createTextureVerifier` with per-URI inflight map that deletes entries on settle so failures retry.
- `helpers/browser-image.ts` keeps the browser check importable under vitest's node environment.

### Task 4 — Session-only texture + decision state

- `session-state.svelte.ts`: `recentTextureIds` (dedupe, cap 8), `textureLoadStates` (keyed by exact URI), `pendingMaterialEdit`.
- `museum-editor.types.ts` carries `EditorPendingMaterialEdit` (now with `sharedMaterialInstanceId`), `EditorTextureLoadState`, `MaterialInstancePatch`, `MaterialEditDecision`, `MaterialShareMode`.

### Task 5 — Atomic material-resource mutator + store facade

- `store/material-resource-mutator.svelte.ts` — re-resolves entity/texture/instance/usage on every call; one transaction per commit; first-assignment, in-place, make-unique, edit-shared paths; `decision-required` for model base material and shared edits.
- Store facade on `MuseumEditorStore`: `registerTexture` (async verify → recheck → commit), `probeTexture`, `requestMaterialEdit`, `requestTextureAssignment` (selects target on success), `confirmPendingMaterialEdit`, `cancelPendingMaterialEdit`, `makeMaterialInstanceUnique`; `textureVerifier` injectable via options.
- 11 new facade integration tests in `museum-editor.test.ts` (registration, failure/duplicate no-history, probe, primitive/model assignment, shared unique, lights reject, inspector patch + undo/redo).

### Task 6 — Textures asset-library UI

- `EditorAssetLibrary.svelte`: fourth tab (four-column tab grid), "Name or URI" search, register form with async verification + duplicate submission guard, session-probed load badges (loading/ready/error + Retry), Recently used section, keyed thumbnail grid with `<img>` (no Three.js materials), `draggable` only when ready, custom MIME only (no `text/plain`).

### Task 7 — Material inspector + choice dialog + precedence

- `EditorMaterialInspector.svelte` — read-only instance name/id, base material select, base texture select with None, roughness/metalness numeric fields with Use base, shared usage count + Make unique, Phase 5.3 rendering note.
- `EditorMaterialChoiceDialog.svelte` — modal for base-material choice and Make unique / Edit shared; Escape cancels; Confirm disabled until required choices exist; session-only state.
- `EditorInspector.svelte` mounts the Material inspector for single model/primitive selections; a selected model/primitive now overrides generic Assets inspection so viewport drops surface entity editing while the Assets tab stays open.
- Primitive catalogue select relabelled `Fallback material`.
- Dialog mounted once in `MuseumEditorApp.svelte` outside the canvas.

### Task 8 — Viewport texture drag/drop

- `EditorSelection.svelte`: `toNdc`/`raycast` generalized to any `{ clientX, clientY }`; capture-phase `dragover` (preventDefault only for the texture MIME) and `drop` listeners registered/removed with the existing pointer listeners; drop raycasts, resolves one model/primitive via `firstRenderablePlacementId`, reports unsupported targets, and calls `requestTextureAssignment`.
- No drag-hover geometry; `text/plain` never accepted.

## Verification (final gate)

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/content/texture-uri.test.ts \
  src/lib/content/scene-codec.test.ts \
  src/lib/editor/editor-textures.test.ts \
  src/lib/editor/texture-verifier.test.ts \
  src/lib/editor/store/session-state.test.ts \
  src/lib/editor/store/material-resource-mutator.test.ts \
  src/lib/editor/editor-selection.test.ts \
  src/lib/editor/museum-editor.test.ts
```

- Focused: **8 files / 319 / 319** passed.
- Full museum suite: **40 files / 660 / 660** passed.
- `npm run check -w @portfolio/museum`: **0 errors, 0 warnings**.
- `npm run build -w @portfolio/museum`: exit 0 (adapter-auto env note only).
- `git diff --check`: silent.

## Production isolation

- `/dev/museum-editor` load guard (`+page.server.ts`) still returns 404 outside dev.
- All Phase 5.2 editor modules (verifier, mutator, dialog, Material inspector, texture library) are reachable only from the editor entry; visitor `/museum` chunks unchanged.
- Phase 5.3 files untouched: `MuseumMaterial.svelte`, `texture-cache.ts`, `EntityPrimitive.svelte`, `AssetModel.svelte`.

## Known limitation

Assigned materials are persisted to canonical v6 JSON but do not yet render — viewport material-instance rendering, shared texture-cache lifecycle, and JSON visual round-trip parity land in Phase 5.3.

## Next slice

Phase 5.3 — resolve each entity's optional `materialInstanceId` in the shared editor/visitor renderer, combine catalogue base with scene overrides, load `baseTextureId` through the shared URI cache, and own cache reference counting/disposal.
