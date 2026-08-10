# Priority-1 Split 3 — Texture Library Controller + Module Helpers

**Status:** Complete
**Date:** 2026-08-03
**Plan:** [`../superpowers/plans/2026-08-03-priority-1-file-splits.md`](../superpowers/plans/2026-08-03-priority-1-file-splits.md)

## What landed

Extracted the Phase 5.2 texture-library orchestration (~160 LOC) and three
module-level helpers out of `MuseumEditorStore` into focused new modules:

- `apps/museum/src/lib/editor/store/texture-library-controller.svelte.ts`
  (new, 252 LOC, 7 public methods):
  - `EditorTextureLibraryControllerHost` — structural surface (10 members):
    mutation guards, document, `selectionActions`, `materialResourceMutator`,
    `session`, and the facade status channel. The browser-loaded
    `textureVerifier` is passed as a separate constructor argument so the
    `options.textureVerifier ?? createTextureVerifier()` defaulting stays in
    the `MuseumEditorStore` constructor (slice scope: only the
    `EditorTextureLibraryController` uses it).
  - `EditorTextureLibraryController` — the orchestration class:
    `registerTexture(name, uri)` (async, URI safety → URI-dedup →
      verifier → re-race after await → mutator commit),
    `probeTexture(textureId)` (async, non-mutating loader probe),
    `requestMaterialEdit(entityId, patch)` (inspector patch entry),
    `requestTextureAssignment(entityId, textureId)` (viewport drop entry;
      selects + marks recent on commit),
    `confirmPendingMaterialEdit(decision)` (replay + decision refresh on
      stale `decision-required`),
    `cancelPendingMaterialEdit()` (clear queued decision),
    `makeMaterialInstanceUnique(entityId)` (one-line delegate).
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  (2 728 → 2 554 LOC, **−174 LOC**; the 86-LOC gap from the in-method
  move count comes from the new `textureLibraryController` field doc block
  + the new helpers-block import re-export block + the section-header
  comment refresh — the actual moved code was 160 LOC):
  - New `private readonly textureLibraryController:
    EditorTextureLibraryController` field, instantiated in the constructor
    right after `materialResourceMutator` / `textureVerifier` so both hosts
    are live before the controller binds.
  - 7 public method bodies deleted; one-line delegations with identical
    signatures keep the pre-slice public surface byte-compatible.
  - 4 module-level helper bodies deleted; the facade imports them from
    `helpers/scene-keys.ts` / `helpers/route-clone.ts` / `helpers/document-clone.ts`.
  - 2 re-exports added at the top of the file so the 40 consumer imports
    (`import { cloneMuseumSceneDocument } from '$lib/editor/museum-editor.svelte'`
    and any `import { cloneResolvedCameraRoute } …`) still resolve to the
    god-file facade without changes. Slice 6 collapses them.

- **New helper files**:
  - `apps/museum/src/lib/editor/helpers/route-clone.ts` (91 LOC):
    `cloneResolvedCameraRoute(route)` + private `cloneRoutePoint(point)` and
    `isRoutePointTuple(point)`. Deep-clones a resolved camera route so the
    editor never mutates a captured route snapshot.
  - `apps/museum/src/lib/editor/helpers/document-clone.ts` (24 LOC):
    `cloneMuseumSceneDocument(document)`. JSON round-trip deep-clones the
    checked-in scene document so the session starts from its own copy.
  - `apps/museum/src/lib/editor/helpers/scene-keys.ts` (66 LOC, +16 vs.
    pre-slice): existing registry + tree-expansion helpers now joined by
    `cameraDirectionTreeKey(connectionId, direction)` —
    `${connectionId}${CAMERA_DIRECTION_TREE_KEY_SEPARATOR}${direction}` — the
    only stable ${director-tour} tree key the facade reads.

No behavior change: each moved body is byte-for-byte identical except for
the mechanical `this.X` → `this.host.X` rewrite (the same disciplined
structural-cast pattern Slice 1 + Slice 2 used).

## Plan deviation: duplicate `cloneResolvedCameraRoute` in `camera-preview-controller.svelte.ts`

`store/camera-preview-controller.svelte.ts` keeps its own
`cloneResolvedCameraRoute` implementation (lines ~70–110) so the FSM
sub-store doesn't have to import an editor helper. After Slice 3 the
helpers module is the canonical surface and the controller should import
from there — left untouched for Slice 3 because:

1. The plan's freeze rule keeps the controller's interface stable until
   Slice 6 collapses it.
2. The controller-local copy is the one consumed by `FSM.play()` etc.,
   and changing that boundary is a separate risk profile.
3. Both implementations are equivalent — moving the controller's import
   is a pure textual rename with no behavior delta.

Documented here so the post-Slice-3 requirements review can tag it as a
Slice 4 / Slice 5 cleanup candidate (the user expects one
`cloneResolvedCameraRoute`; we're carrying two until the controller
migration lands).

## Files touched

- Create `apps/museum/src/lib/editor/store/texture-library-controller.svelte.ts`
- Create `apps/museum/src/lib/editor/helpers/route-clone.ts`
- Create `apps/museum/src/lib/editor/helpers/document-clone.ts`
- Modify `apps/museum/src/lib/editor/helpers/scene-keys.ts` (add
  `cameraDirectionTreeKey`)
- Modify `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - New import block (3 lines: `texture-library-controller` + 2 re-exports).
  - New `cameraDirectionTreeKey` added to the existing
    `helpers/scene-keys` import.
  - 4 module-level helpers deleted (`cameraDirectionTreeKey`,
    `isRoutePointTuple`, `cloneRoutePoint`, `cloneResolvedCameraRoute`).
  - `cloneMuseumSceneDocument` body removed (replaced by re-export).
  - New `textureLibraryController` field declaration (~10-line doc block).
  - New constructor initialization (~7 lines).
  - 7 public method bodies deleted and replaced with one-line
    delegations.
  - Section-header comment refreshed to point at the new controller.

## Verification evidence

- Typecheck: `npx tsc --noEmit -p apps/museum/tsconfig.json` — clean
- Focused suites per plan Step 3 (6 files): **290 / 290 passed**
  (`museum-editor.test.ts` 169, `material-resource-mutator` 22,
  `session-state` 51, `editor-textures` 11, `texture-verifier` 6,
  `scene-codec` 31)
- Full suite: **40 files / 660 tests passed**
- `npm run check -w @portfolio/museum`: **0 errors / 0 warnings**
- `git diff --check`: clean
- File sizes: `museum-editor.svelte.ts` 2 728 → 2 554 LOC (−174 LOC);
  new controller 252 LOC; helpers `route-clone.ts` 91 +
  `document-clone.ts` 24 + `scene-keys.ts` +16 = total 131 LOC of new
  helper space. End-state plan target was ~2 500 LOC for this slice —
  landed at 2 554 (54 LOC above the plan checkpoint, 86 LOC ending
  explained by the new controller's doc block + the helpers-section
  re-exports).

## Next slice

Slice 4 — split `museum-editor.test.ts` (4 350 LOC → themed suites). Pulls
pure-helper describes into their dedicated `editor-*.test.ts` files and
moves store-integration describes into themed sibling suites sharing one
`editor-test-utils.ts` fixture module. The texture-orchestration describes
(Phase 5.2 texture facade describe block) move into the new
`museum-editor-textures.test.ts`. The slice also graphs the create-store
helpers + `EditorMaterialResourceMutator` describe into the
`material-resource-mutator.test.ts` extension.
