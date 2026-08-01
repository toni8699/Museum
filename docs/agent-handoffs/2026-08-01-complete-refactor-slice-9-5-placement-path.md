# Slice 9.5 hand-off — EditorPlacementClusterMutator + EditorPathAnchorMutator

**Status:** COMPLETE  
**Date:** 2026-08-01  
**Branch:** main  
**Last commit:** no commit (user decides)

## What landed

1. **`EditorPlacementClusterMutator`** + `EditorPlacementClusterMutatorHost` in
   [`store/placement-cluster-mutator.svelte.ts`](../../apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts)
   (**450 LOC**).

   Moved bodies: cluster CRUD/membership, `duplicateSelection`,
   `deletePlacements` / `deleteSelection` / `deletePlacement`,
   `updatePlacementTransform` / `commitPlacementTransform`,
   `beginAssetPlacement` / `cancelAssetPlacement` / `createPendingPlacementAt`,
   `requestDropToFloor`, `isPlacementSelectable`.

2. **`EditorPathAnchorMutator`** + `EditorPathAnchorMutatorHost` in
   [`store/path-anchor-mutator.svelte.ts`](../../apps/museum/src/lib/editor/store/path-anchor-mutator.svelte.ts)
   (**314 LOC**).

   Moved bodies: `update`/`commitNavigationNodePoint`, connection draft →
   smooth, anchor insert/update/commit/delete, node label/FOV mutate.
   Ctor is host-only (no `selectionActions` — anchors set
   `navigationSelection` via host).

3. **Facade** (`museum-editor.svelte.ts`, **3314 LOC**) — composition root +
   thin public delegates + host factories + canceler slots + re-exports.
   Public method names/signatures unchanged (Option-3).

## LOC delta (approx)

| File | LOC |
|------|-----|
| `museum-editor.svelte.ts` | **3314** (was ~3591 before 9.5; net shrink) |
| `placement-cluster-mutator.svelte.ts` | **+450** (new) |
| `path-anchor-mutator.svelte.ts` | **+314** (new) |

Neither new mutator exceeds 600 LOC — no follow-up split required for 9.5.
Prior >600 notes still apply: nav-mutator **865**, view-keyframe **823**.

## Test results

- From `apps/museum`: `npm test -- src/lib/editor` → **409 passed / 26 files**
- From repo root: `npm run check` → **0 errors / 0 warnings**
- Svelte autofixer on new `.svelte.ts` files: internal parse noop only (same as 9.4)

## Phase 9 status

**Phase 9 complete.** Mutation bodies targeted by slices 9.1–9.5 are extracted.
Facade remaining fat bodies are intentional composition / preview / session /
history ownership — not more Phase 9 slices unless explicitly scoped.

### Remaining facade ownership (not Phase 9 leftovers)

- **Preview orchestration:** `playActiveConnectionEdge`, `preview*`,
  `play`/`pause`/`stop`/`step`/`complete` camera preview, mode/playhead,
  `#prepareCameraPreview`, `#pruneInvalidCameraPreview`,
  `#resolveCameraPreviewRoute`
- **Session chrome:** workspace/panels, timeline height, tree expansion,
  transform tool/space/snap, focus*, lighting, interaction flags, hover
- **History / document I/O:** `begin`/`commit`/`cancel` document + framing tx,
  `importDocument` / replace / export, `#reconcileSelection`,
  `#seedEmptyReverseForSelectedForwardTrack`
- **Cancelers + frame channel:** transform/path/framing canceler slots;
  `requestPlacementFrame` / `consumePendingFrame` / `cancelPendingFrame`
- **Selection leave:** `finishAnchorEditing` / `finishViewKeyframeEditing`
- **Composition:** host factories, controller construction, re-exports

## Gotchas

- Host drop hook is `sessionRequestDropToFloor()` → `session.requestDropToFloor()`;
  public `requestDropToFloor()` stays on the mutator (guards + status message).
  Do not wire the public name onto the host or you recurse.
- `cancelAssetPlacement` ↔ `cancelPendingNavigation` cross via facade thin
  delegates (nav host → placement mutator; placement host → nav mutator). Safe
  at runtime; construction order is nav then placement.
- Path-anchor host types must match facade getters:
  `cameraSelection: EditorCameraSelection | null`,
  `pendingNavigationNode: SceneNavigationNode | undefined`.
- `isPlacementSelectable` body lives on the placement mutator; facade +
  selection host still thin-delegate (focus / cycle keep working).
- `vec3Matches` / `isFiniteVec3` removed from the god file; duplicated locally
  in path-anchor (and already in view-key / nav) like other controllers.
- Pending-frame channel stays on the facade; duplicate only calls
  `requestPlacementFrame` through the host.

## Next work (out of Phase 9)

Out-of-scope tracks from the refactor plan — e.g. `EditorSelection.svelte`,
Rig, further UI splits — **not** more Phase 9 mutator slices unless a fat
preview/session body is deliberately scheduled as a later phase.
