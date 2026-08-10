# Phase 6 (Full Track) — Phases 1a + 1b shipped

## Scope

Two cross-cutting slices landed in one working diff:

- **Phase 1a — Independent Scale UX.** Editor transform inspector gets a chain toggle; uniform / independent modes map directly to `scaleScalar / scaleVector` on `PlacementTransform`. Gizmo writes per-axis when mode is independent; visitor render path falls back to the average scalar (documented lossiness until schema v7).
- **Phase 1b — Placement Ghost Preview.** Wireframe OBB ghost walks alongside the cursor while a primitive / asset / light is armed. Existing click pipeline in `EditorSelection.svelte` (calls into `createPendingPrimitiveAt / createPendingPlacementAt / createPendingLightAt`) is unchanged — the ghost adds a visual cue, no new commit path. Esc cancels via existing `cancelPrimitivePlacement`. **No drag-and-drop** anywhere in this handoff.

## Files changed

### New

- `apps/museum/src/lib/editor/scale-vector.ts` — pure helpers (`MIN_PLACEMENT_SCALE`, `SCALE_VALUES_TOLERANCE`, `isUniformValue`, `isUniformVector`, `averageScale`, `normalizeScale`, `dominantMode`, `scaleVectorEquals`). Re-exported from `editor-transform.ts`.
- `apps/museum/src/lib/editor/scale-vector.test.ts` — 23 tests.
- `apps/museum/src/lib/editor/placement-ghost.ts` — `PlacementGhostPrototype`, `PlacementPhase`, validity reasons + colour table, `computeGhostTransform`, `computePrototypeBox3`, `isValidGhostPlacement`, `getGhostColorForReason`. Pure (Three.js dep OK; no DOM). 18 tests.
- `apps/museum/src/lib/editor/placement-ghost.svelte` — Threlte-mounted component using `useTask` + `useThrelte`. Walks `scene` for floors tagged `userData.editorSurface.type === 'floor'`. Reuses Phase 6.2 `obb-util` for the wireframe.

### Modified

- `apps/museum/src/lib/editor/editor-transform.ts` — `PlacementTransform` gains `scaleScalar`, `scaleVector`, `scaleMode`. `placementTransformFromObject` reads all three axes of `root.scale` and reports `independent` whenever they diverge. `writePlacementTransform` collapses independent vector to visitor scalar via `averageScale`.
- `apps/museum/src/lib/editor/editor-transform.test.ts` — 5 new tests cover the dual-axis round-trip.
- `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts` — adds `scaleMode: ScaleMode` (default `'uniform'`), `toggleScaleMode()`, `setScaleMode(mode)`.
- `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts` — 4 new tests.
- `apps/museum/src/lib/editor/EditorTransformInspector.svelte` — chain-icon toggle (locked + unlocked SVG) + X/Y/Z fields branch.
- `apps/museum/src/lib/editor/EditorTransformControls.svelte` — `previewTransform` skips `enforceUniformObjectScale` when `scaleMode === 'independent'`. Per-axis gizmo writes now reach `PlacementTransform.scaleVector` end-to-end.
- `apps/museum/src/lib/editor/EditorViewport.svelte` — mounts `<PlacementGhost>` inside the Threlte `<Canvas>` (dev-only conditional on `store.isVisitorCameraPreview`).
- `apps/museum/src/lib/editor/museum-editor.test.ts` — adds the three new transform fields to one hand-rolled transform literal.

## Test evidence

| Gate | Result |
|---|---|
| `npx vitest run --reporter=basic` | **954 pass** / 0 fail / 67 files (3 new test files added: `scale-vector.test.ts` 23, `placement-ghost.test.ts` 18, `editor-transform.test.ts` +5) |
| `npx svelte-check` | **0 errors / 0 warnings** |
| `npx vite build` | success |
| Visitor `/museum` route grep (`scaleScalar / scaleVector / PlacementGhost / pendingPlacementPrimitiveKind`) | **0 matches** across `.svelte-kit/output/server/entries/pages/museum/_page.svelte.js` + all client `nodes` + `chunks` |
| Editor `/dev/museum-editor` route bundle | dev-only — outside production output (same baseline as Phase 6.2) |

## Behavioural notes

1. **Default mode `'uniform'`.** Pre-Phase-1 scenes serialize byte-identical: `scaleScalar=1` falls within ε and `writePlacementTransform` deletes `placement.scale` as before. No data migration needed.
2. **Visitor fidelity is fallback-by-average.** Visitors render independent-scaled placements at `(x + y + z) / 3` scale. Documented in spec §0 as acceptable v1 lossiness; closes in schema v7.
3. **Ghost surfaces only while armed.** Placement / asset / light kinds each map to a `PlacementGhostPrototype`; Light ghost reuses Box defaults (`{ width: 0.3, height: 0.3, depth: 0.3 }` placeholder pending Phase 2 wiring).
4. **Floor targets walk the scene.** `placement-ghost.svelte` traverses the Threlte scene every frame; floor meshes are tagged via existing `userData.editorSurface = { type: 'floor', placeable: true, roomId }` set up by `EditorPlacementTools.svelte`. Fallback to ground-plane intersection when no tagged floor is present (e.g. Paris-only Paris crown without room-mount).
5. **`cancelPrimitivePlacement` doubles for asset / light.** Existing helper clears all three pending slots — the Esc handler simply calls it.

## Open decisions (parked — Phase 4+)

- Persist `scaleMode` per-document on commit (currently session-only). Plan §spec §Open Decisions #2.
- Visitor fidelity once schema v7 lands (carries `scaleVector` properly).
- `MuseumEditorStore.scaleMode` mirror for components that read the store directly instead of the interaction store.
- Light ghost sized to a sphere placeholder matching `DEFAULT_LIGHT_HEIGHT`.

## Next steps

- Phase 2 — Architecture Shape Catalogue (named entries + Add submenu).
- Phase 3 — Local asset import (Click Browse…, no drag-and-drop), gltf-pipeline compression job, cross-room editing unblocked by Phase 1b's per-room-floor cursor tracking.
