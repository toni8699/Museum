# Slice 9.2 hand-off — EditorNavigationGraphMutator

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (user decides)

## What landed

`EditorNavigationGraphMutator` + `EditorNavigationGraphMutatorHost` in
[`store/navigation-graph-mutator.svelte.ts`](../../apps/museum/src/lib/editor/store/navigation-graph-mutator.svelte.ts).

Moved bodies: pending nav, guided tour, topology delete, `setConnectionTiming` / `setNodeHoldSeconds`.
Facade methods are thin delegates. Public re-exports (`CAMERA_NODE_CREATION_DEFAULTS`, `validateSceneConnectionTiming`) re-exported from god file.

`helpers/scene-keys.ts` gained `CAMERA_DIRECTION_TREE_KEY_SEPARATOR`.

## Test results

- editor vitest: 409 passed
- `npm run check`: 0 errors / 0 warnings

## Next-slice read list (9.3)

- This HO + 9.1 HO
- `navigation-graph-mutator.svelte.ts` host pattern
- View-keyframe methods on `museum-editor.svelte.ts` (add/update/commit/delete, progress-drag, copy track, `setViewKeyframeTiming`, `finishViewKeyframeEditing`)
- Do NOT re-read pending-nav/tour bodies (moved)

## Gotchas

- Host-only access; use guard-aware facade `begin/commit` wrappers (seed-reverse on commit).
- `runOrFail(this.host, …)` via `setStatusMessage` on host.
- Timeline sync still on store — expose via host if 9.3 needs it.
- Real tour insert name: `insertNodeIntoGuidedTour` (not From).
