# Slice 2 hand-off — EditorSceneRoots

**Status:** COMPLETE
**Date:** 2026-07-30
**Branch:** main
**Last commit:** no commit (slice author stops per AGENTS.md)

## What landed

The four private `#…Roots` `Map<string, Object3D>` fields +
`registryVersion = $state(0)` + `#bumpRegistryVersion()` + the three
inline `cameraHelperKey` / `anchorHelperKey` / `viewKeyframeHelperKey`
helpers have been promoted to a focused `EditorSceneRoots` sub-store
with a single `version = $state(0)` reactivity source. The god file
now holds 12 thin one-line delegates (3 per family × register /
unregister / get), a `get registryVersion()` compat shim that forwards
`this.roots.version` so existing component reads (`EditorCameraRig.svelte`,
`EditorTransformControls.svelte`) and 6 numeric test assertions in the
existing safety net continue to work unchanged, and a `get sessionView()`
proxy from Slice 1 still surfaces the read-only session face. The
sanity net went from "149 tests in 2 files" (post Slice 1.E) to
"300 tests in 18 files" (post Slice 2) — every previously-green
assertion still passes.

## Files added / modified

- `apps/museum/src/lib/editor/helpers/scene-keys.ts` — NEW (~28 LOC).
  Exports `cameraHelperKey`, `anchorHelperKey`, `viewKeyframeHelperKey`,
  the `CAMERA_HELPER_KEY_SEPARATOR` constant, and the `SceneRootKind`
  type. The three inline helper-key functions on the god file were
  retired and replaced with this import.
- `apps/museum/src/lib/editor/store/scene-roots.svelte.ts` — NEW (~180
  LOC). Exports `EditorSceneRoots`. Holds 4 private `Map`s, one
  `version = $state(0)`, 12 public register/unregister/get methods,
  `notifyPlacementRootChanged(id)` (which short-circuits if no
  placement is registered per the pre-slice contract), and the
  diagnostic `ids(kind: SceneRootKind)`. Both `version++` lines are
  wrapped in `untrack(() => { this.version++ })`, matching the
  pre-slice `#bumpRegistryVersion` semantic that Svelte 5 expects for
  state writes from inside non-tracked regions.
- `apps/museum/src/lib/editor/store/scene-roots.test.ts` — NEW (~195
  LOC). 20 vitest assertions covering all four register/unregister/get
  families, idempotent re-write, stale-root unregister no-op,
  `ids(kind)` per-family diagnostics, `version` monotonicity
  semantics, and `notifyPlacementRootChanged` (split into "no-op
  when id not registered" + "bumps after register").
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — MODIFIED.
  - Added imports: `EditorSceneRoots` from `./store/scene-roots.svelte`
    and the `cameraHelperKey` / `anchorHelperKey` / `viewKeyframeHelperKey`
    / `CAMERA_HELPER_KEY_SEPARATOR` set from `./helpers/scene-keys`.
  - Replaced the 4 private `#…Roots` `Map` fields (lines 430–433 of
    the pre-slice file) with `private readonly roots = new EditorSceneRoots();`.
  - Deleted `registryVersion = $state(0)`.
  - Deleted the `untrack`-wrapped `#bumpRegistryVersion()` private
    method.
  - Deleted the inline `const CAMERA_HELPER_KEY_SEPARATOR = ':';`
    and the three inline key-building helpers (lines 244–260
    pre-slice).
  - Replaced 12 register/unregister/get methods + `notifyPlacementRootChanged`
    with one-line delegates that forward to `this.roots`.
  - Rewrote the 4 getter readers from `void this.registryVersion;`
    to `void this.roots.version;`.
  - `getPlacementRoots(ids?)` body now reads through `this.roots.getPlacementRoot`
    per id, same signature.
  - Added `get registryVersion() { return this.roots.version; }`
    compat shim so existing consumers (`void store.registryVersion`
    in two `.svelte` components + 6 numeric `toBe(...)` reads in the
    safety net) keep working without rewriting.
  - The 3 `getSelectedCameraHelperRoot` / `getSelectedAnchorHelperRoot`
    / `getSelectedViewKeyframeTargetHelperRoot` composition getters
    stayed untouched — each reads the selection sub-state to compose
    a call into the root delegate.

## Public surface diff

**Reads (unchanged signatures on `MuseumEditorStore`):**
- `store.getPlacementRoot(id)`
- `store.getPlacementRoots(ids?)`
- `store.getCameraHelperRoot(nodeId, handle)`
- `store.getAnchorHelperRoot(connectionId, anchorId)`
- `store.getViewKeyframeTargetHelperRoot(connectionId, direction, keyframeId)`
- `store.getSelectedCameraHelperRoot()`
- `store.getSelectedAnchorHelperRoot()`
- `store.getSelectedViewKeyframeTargetHelperRoot()`
- `store.registryVersion` — **read-only getter** (was `$state` slot
  pre-slice; now forwards `roots.version`)

**Mutations (unchanged signatures, 1-line bodies):**
- `store.registerPlacementRoot(id, root)`
- `store.unregisterPlacementRoot(id, root)`
- `store.registerCameraHelperRoot(nodeId, handle, root)`
- `store.unregisterCameraHelperRoot(nodeId, handle, root)`
- `store.registerAnchorHelperRoot(connectionId, anchorId, root)`
- `store.unregisterAnchorHelperRoot(connectionId, anchorId, root)`
- `store.registerViewKeyframeTargetHelperRoot(connectionId, direction, keyframeId, root)`
- `store.unregisterViewKeyframeTargetHelperRoot(connectionId, direction, keyframeId, root)`
- `store.notifyPlacementRootChanged(id)`

**Sub-store public surface (`apps/museum/src/lib/editor/store/scene-roots.svelte`):**
- `class EditorSceneRoots`
- `version: number` — `$state` counter, `untrack`-bumped on every
  registered/unregistered root
- 12 register/unregister/get methods (4 families × 3 ops)
- `notifyPlacementRootChanged(id: string): void`
- `ids(kind: SceneRootKind): string[]`
- `type SceneRootKind = 'placement' | 'camera-helper' | 'anchor-helper' | 'view-keyframe-target-helper'` exported from `helpers/scene-keys.ts`.

**Removed:**
- `registryVersion = $state(0)` $state slot on the god file.
- `#bumpRegistryVersion()` private method on the god file.
- 4 private `#placementRoots` / `#cameraHelperRoots` /
  `#anchorHelperRoots` / `#viewKeyframeTargetHelperRoots` `Map`
  fields on the god file.
- The inline `const CAMERA_HELPER_KEY_SEPARATOR = ':';` constant
  on the god file (now exported from `helpers/scene-keys.ts`).
- The 3 inline `cameraHelperKey` / `anchorHelperKey` /
  `viewKeyframeHelperKey` functions on the god file (now exported
  from `helpers/scene-keys.ts`).

## Test results

- `cd apps/museum && npm run check` → **0 errors, 0 warnings** (svelte-check + tsc).
- `cd apps/museum && npx vitest run src/lib/editor/` → **18 test files
  passed, 300 tests passed** in 1.80 s. New `store/scene-roots.test.ts`
  contributes 20 assertions across 8 `it()` blocks. The full editor
  safety-net (museum-editor + scene-keys indirect + session-state +
  scene-roots) is green.
- Specifically, the 6 `store.registryVersion` numeric assertions the
  audit flagged as potentially incompatible with the compat shim
  (museum-editor.test.ts lines 363, 367, 370, 374, 377, 828, 830)
  continue to pass.
- `npm test` from repo root (which delegates to museum via
  `npm run test -w @portfolio/museum`) also reaches green via the
  single `vitest.config.ts` made canonical in Slice 1.E.

## Next-slice read list (DO NOT re-scan)

Slice 3 is `Document + History + Preview` and **atomic** per the
refactor plan §3.A.2 — `canUndo` reads `preview.transportState`,
so History takes Preview as a constructor collaborator. Slice 3 must
ship Document, History, and Preview together.

Slice 3 author reads ONLY:

- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — lines
  343–360 (the in-class declaration block for `document`,
  `validation`, `baselineCanonicalJson`, `scene`, `state`).
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — lines
  4086–4260 (the full document transaction + history lifecycle:
  `#transactionBefore`, `beginDocumentTransaction`,
  `beginCameraFramingTransaction`, `commitDocumentTransaction`,
  `cancelDocumentTransaction`, `undo`, `redo`, plus the
  `#replaceDocument` / `#reconcileSelection` / `#replaceRuntime`
  helpers at lines 4150–4190, plus `documentsMatch` private helper
  around line 238). Search for `#transactionBefore` is the most
  reliable anchor.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — lines
  2481–2850 (camera preview FSM methods — `#prepareCameraPreview`,
  `#refreshPausedDirectorPreview`, `#pruneInvalidCameraPreview`,
  `#releasePausedPreviewForTopology`, `playCameraPreview`,
  `pauseCameraPreview`, `stopCameraPreview`, `requestDropToFloor`,
  `previewGuidedTour`, plus `#cameraTimelineGraph` /
  `#cameraTimelineCache` private state).
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — lines
  2195–2480 (camera timeline scrub + the `getCameraTimeline`,
  `#syncCameraTimelineForConnection`, `#syncCameraTimelineForNode`,
  `#canSeekCameraTimeline`, `#clearCameraFocusRequest` private
  helpers).
- `nodes` of `museum-editor.test.ts` describing `undo`, `redo`,
  `preview*`, `camera-timeline`, and `transaction` — Slice 3 must
  keep all those assertions green.
- `docs/refactor-audit/2026-07-28-museum-editor.md` §3.A1, §3.A2,
  §3.B.

You do **not** need to re-read `apps/museum/src/lib/editor/store/scene-roots.svelte.ts`
or `helpers/scene-keys.ts`. Both are const files; if Slice 3 needs
any registry surface it reads through god-file delegates.

You do **not** need to re-read the 12 root-rw method bodies on the
god file — they are one-line forwards and Slice 3 doesn't touch them.

You do **not** need to re-read the `get registryVersion()` compat
shim. Slice 3 has no use for it; the registryVersion shim is
historical glue for legacy `void store.registryVersion` reads and
will stay until Slice 6's selection migration rewires consumers to
read selection/transform directly.

## Type-signature changes visible to the next slice

- `class EditorSceneRoots` is exported from
  `apps/museum/src/lib/editor/store/scene-roots.svelte.ts`. Its
  public surface is the 12 register/unregister/get methods +
  `notifyPlacementRootChanged(id: string): void` +
  `ids(kind: SceneRootKind): string[]` + the `$state` `version: number`.
- `type SceneRootKind` is exported from
  `apps/museum/src/lib/editor/helpers/scene-keys.ts` and is
  `'placement' | 'camera-helper' | 'anchor-helper' | 'view-keyframe-target-helper'`.
- `const CAMERA_HELPER_KEY_SEPARATOR`, `cameraHelperKey`,
  `anchorHelperKey`, `viewKeyframeHelperKey` are all exported from
  the same `helpers/scene-keys.ts` module — god-file delegates +
  the `cameraDirectionTreeKey` filter at line 3676 all import from
  here. (Note: `cameraDirectionTreeKey` itself remains defined on
  the god file at the same line band — see Known gotchas.)
- No `$state` slot eliminated: `cameraDirectionTreeKey` reads
  `CAMERA_HELPER_KEY_SEPARATOR` as a regular imported constant
  rather than a `$state`, so no reactivity concern.

## Known gotchas

1. **`cameraDirectionTreeKey` still lives on the god file** but
   pulls `CAMERA_HELPER_KEY_SEPARATOR` from
   `helpers/scene-keys.ts`. Functionally correct; structurally
   asymmetric with the three sibling helpers (`cameraHelperKey`,
   `anchorHelperKey`, `viewKeyframeHelperKey`) that are all in
   `helpers/scene-keys.ts`. A future polish step can move
   `cameraDirectionTreeKey` into the helpers module as well (~10
   LOC delta). Tracked for Slice 8's polish phase per the plan.

2. **`get registryVersion()` compat shim is intentional, not
   dead code.** Three pre-slice consumers — `EditorCameraRig.svelte:387`,
   `EditorTransformControls.svelte:165`, and 6 numeric assertions
   in `museum-editor.test.ts:363,367,370,374,377,828,830` — depend
   on the prop's integer-increment contract. Removing the shim
   would either break those consumers outright or force a Slice-3
   reader migration (out of scope). Annotate it with a
   `@deprecated`-style JSDoc in a future slice if you want to
   gently redirect new code to read `store.roots.version` directly
   — until then, the shim is load-bearing.

3. **`scene-keys.ts` import path** uses `../editor-selection`
   (not `./editor-selection`) because the file lives one level
   deeper (`apps/museum/src/lib/editor/helpers/scene-keys.ts`).
   The audit's earlier reference to a `./helpers/scene-keys.ts`
   was stale-by-the-time-it-typed. Future contributors moving any
   file inside `helpers/` should use `../<name>` to reach the
   editor's top level.

4. **`!` non-null cast at `scene-roots.test.ts:160`** —
   `roots.registerPlacementRoot('a', roots.getPlacementRoot('a')!)`.
   Defended by the immediately preceding register-then-assert
   block. Runtime-safe but stylistically the only `!` cast in the
   suite. If Slice 6 adds more "register-then-re-register-same-id"
   tests, prefer the `const same = ...; if (same) ...` guard
   pattern over accumulating casts.

5. **`untrack` import on the god file is still earned.** `#bumpHistoryVersion`
   at the post-slice line band still does
   `untrack(() => { this.historyVersion += 1; })`. Confirmed during
   this slice's reads. The removed `#bumpRegistryVersion` was the
   only OTHER consumer.

6. **Private field on the god file** — `private readonly roots =
   new EditorSceneRoots()` is `private` per TypeScript but the
   instance is fully reachable via runtime reads from god-file
   code. Slice 3 must NOT use this field to bypass the composition
   pattern: treat `roots` as if it were `#`-private and only access
   it through the 12 god-file delegates.

## Open questions for next slice

1. **Atomic constraint** — Slice 3 ships Document + History + Preview
   together because `canUndo` reads `preview.transportState`. The
   plan's cross-cutting risks #2 warn explicitly that a partial
   Slice 3 leaves the suite broken. Slice 3 author must not split
   the work across multiple PRs.

2. **`historyVersion` is not a `version = $state(0)` mono-bump.**
   History is reified (`#past`/`#future` snapshot stack). Don't
   propose reusing Slice 2's pattern. The `EditorHistoryController`
   takes the `EditorCameraPreviewController` as a constructor
   collaborator (peer-link), exactly as `viewKeyframeProgressDragInitialProgress`
   cancellation flows peer-link through the focus channel.

3. **`notifyPlacementRootChanged` only handles placement family.**
   If Slice 3 documents a need for force-re-rendering after non-
   placement root changes (e.g. an editor camera preview route
   change invalidates a `view-keyframe-target-helper`), extend
   `EditorSceneRoots` with `notifyFamily(kind, key)` rather than
   reusing this single watcher.

4. **Compat-shim deprecation timeline.** If Slice 3 / Slice 6 plan
   to migrate the 3 `void store.registryVersion` consumers onto
   `void store.roots.version`, the shim can be deleted in that
   slice. If nobody migrates them, leave the shim and treat it as
   the canonical read for that specific concern.

5. **`cameraDirectionTreeKey` move.** Trivial 5-LOC move into
   `helpers/scene-keys.ts` to make the four-key helper family
   consistent. Worth doing in Slice 8's polish.

## Slice 2 diff overview

```
apps/museum/src/lib/editor/helpers/scene-keys.ts        NEW  (~28 LOC)
apps/museum/src/lib/editor/store/scene-roots.svelte.ts  NEW  (~180 LOC)
apps/museum/src/lib/editor/store/scene-roots.test.ts    NEW  (~195 LOC)
apps/museum/src/lib/editor/museum-editor.svelte.ts      MOD  (~ -40 LOC net)
```

Net: ~ +363 LOC added, ~ -40 LOC on the god file = +323 LOC with a
focused, testable concern. The refactor aims to redistribute code
into seams, not reduce LOC; the count is acceptable at this stage.
