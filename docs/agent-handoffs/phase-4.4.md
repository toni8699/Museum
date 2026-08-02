# Phase 4.4 — Light creation, inspector, rendering, history

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-4-scene-creation.md`](../plans/museum-editor-workspace/phase-4-scene-creation.md) slice 4.4

## Delivered

- Built-in light catalogue + defaults in `editor-lights.ts` (point / spot / directional; `#fff4e0`; intensity `1`; range `8`; spot angle `π/6` + penumbra `0.15`; `castShadow: false`; floor place Y → `2.5`).
- Pending light placement: `beginLightPlacement` → any tagged room floor → `createPendingLightAt(roomId, local)` with one history transaction.
- Mutual cancel with asset / primitive / Escape (`cancelAssetPlacement` clears all three pending modes).
- Add menu: Point / Spot / Directional Light. Assets → Lights with place action.
- Inspector: name, type, color, intensity, kind-gated range/angle/penumbra, cast shadow; transform via existing inspector.
- Duplicate unlocked for lights (offset copy + undo).
- Rendering already lived in `EntityLight` / `MuseumEntities` from 4.2 — no visitor/editor render split change.

## Not in this slice

- Checked-in sample light rows in `museum-scene.json` (optional; create from editor).
- Environment / area / photometric / baked lights.
- Light type conversion after create (immutable `light` kind).
- Textures / material instances (Phase 5).
- Browser/production verification handoff (4.5).

## Key files

- `apps/museum/src/lib/editor/editor-lights.ts`
- `apps/museum/src/lib/editor/editor-lights.test.ts`
- `apps/museum/src/lib/editor/EditorLightInspector.svelte`
- `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts`
- `apps/museum/src/lib/editor/store/session-state.svelte.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorViewportToolbar.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`

## Verify

```bash
cd apps/museum && npx vitest run
```

## Next

Phase 4.5 — browser/production verification and handoff.
