# Phase 4.3 — Primitive creation, placement, inspector, history

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-4-scene-creation.md`](../plans/museum-editor-workspace/phase-4-scene-creation.md) slice 4.3

## Delivered

- Built-in shape catalogue + defaults in `editor-primitives.ts` (box / plane / cylinder / sphere; `wood-walnut`; positive exact-key dims).
- Pending primitive placement: `beginPrimitivePlacement` → any tagged room floor → `createPendingPrimitiveAt(roomId, local)` with one history transaction.
- Mutual cancel with asset placement / Escape (`cancelAssetPlacement` clears both pending modes).
- Add menu: Box / Plane / Cylinder / Sphere. Assets → Models | Shapes with place action.
- Inspector: name, shape, dims, catalogue material, cast/receive shadow; transform via existing inspector.
- Duplicate supports model + primitive (lights still blocked for 4.4).
- `selectRoom` unlocked for any room; `selectPlacement` adopts entity room; scene tree lists rooms that have entities.

## Not in this slice

- Light create UI / richer light helpers (4.4).
- Checked-in sample primitive rows in `museum-scene.json` (optional; create from editor).
- Textures / material instances (Phase 5).
- Drag-from-library onto floor (click-to-arm + floor click only).

## Key files

- `apps/museum/src/lib/editor/editor-primitives.ts`
- `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorPrimitiveInspector.svelte`
- `apps/museum/src/lib/editor/EditorViewportToolbar.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorSceneTree.svelte`
- `apps/museum/src/lib/editor/store/selection-actions.svelte.ts`

## Verify

```bash
cd apps/museum && npx vitest run
```

## Next

Phase 4.4 — light creation, inspector, rendering, and history.
