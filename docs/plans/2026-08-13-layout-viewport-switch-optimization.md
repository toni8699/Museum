# Layout Viewport Switch Optimization

**Date:** 2026-08-13
**Status:** Implemented (measured: Plan→3D toggle 361.7 ms → 21.4 ms; Canvas persists across the toggle)
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md) (post-G1, pre-G4 quick win)
**Prerequisite:** G1 shared geometry compiler (landed)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Eliminate the choppy Plan↔3D toggle in the layout workspace by keeping the
Threlte Canvas mounted across the switch, gating its render loop while the Plan
overlay is active, and sharing bucketed wall/floor materials. Assumes G1 is done.

```text
layout workspace
   ├─ <Canvas>  always mounted (WebGL context + scene persist across toggle)
   │    └─ LayoutRenderGate  → autoRender.current = (viewMode === '3d')
   │    └─ MuseumScene + LayoutPreviewScene + EditorGrid
   └─ {#if viewMode === 'plan'} <LayoutPlanViewport/> {/if}   (absolute overlay, z-index 3)
```

## Current problem

`EditorViewport.svelte:129-141` toggles Plan via a full mount/unmount of the
Threlte `<Canvas>`. Switching to Plan destroys the WebGL context and all scene
objects (`LayoutPreviewScene.svelte:97` emits one box per sampled wall chord,
each with its own `MeshStandardMaterial`); switching back rebuilds everything.
That remount is the visible chop.

## Locked decisions

- Editor-only files; zero visitor imports; zero layout geometry changes.
- The layout `<Canvas>` stays mounted for the whole layout workspace; Plan is an
  SVG overlay above it, not a replacement.
- Render loop paused with `useThrelte().autoRender` + `invalidate()` while Plan
  is visible; camera pose persists across toggles (behavior improvement).
- Wall materials shared by selection bucket (default / wall-selected /
  opening-selected) to preserve per-mesh highlight semantics with three
  instances; floor material shared. Ceiling material stays per-room (reactivity
  to `showCeilings`; rooms are few).
- `showArchitecture` in the non-layout branch is explicitly `true` (equals the
  previous `store.currentWorkspace !== 'layout'` in that branch).
- No commits unless user asks.

## Task 1 — `LayoutRenderGate.svelte` render-loop pause gate

**Files:**
- Create: `apps/museum/src/lib/editor/layout/LayoutRenderGate.svelte`

**Interfaces:**
- Consumes: `LayoutInteractionState` (prop `interaction`), Threlte context via `useThrelte()`.
- Produces: sets `autoRender.current = (viewMode === '3d')`, calls `invalidate()` on transitions. Mounted inside the layout `<Canvas>`.

```svelte
<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import type { LayoutInteractionState } from './layout-interaction';

	let { interaction }: { interaction: LayoutInteractionState } = $props();
	const { autoRender, invalidate } = useThrelte();

	$effect(() => {
		const shouldRender = interaction.viewMode === '3d';
		if (autoRender.current !== shouldRender) {
			// `autoRender` is a `runeToCurrentWritable` in Threlte v8: `.current`
			// is getter-only, so write through the store's `.set()`.
			autoRender.set(shouldRender);
			invalidate();
		}
	});
</script>
```

Verify: `npm run check -w @portfolio/museum` → 0 errors.

## Task 2 — `EditorViewport.svelte` restructure (Canvas persists, Plan overlays)

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorViewport.svelte:126-218`
- Modify: `apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte` (style: `z-index: 3` on `.plan-viewport`)

**Interfaces:**
- Consumes: Task 1 `LayoutRenderGate`; existing `LayoutPreviewScene`, `LayoutPlanViewport`, `MuseumScene`, `EditorGrid`, `EditorCameraRig`, `EditorMuseumEntities`.
- Produces: layout workspace always mounts one `<Canvas>`; Plan is an absolute overlay above it.

Steps:
1. Capture baseline switch timing in browser (Chopin fixture, Plan→3D→Plan loops) for comparison.
2. Replace lines 126-218 with two explicit workspace branches (code in the session plan):
   - layout branch: `LayoutDraftToolbar` + `<Canvas>` containing `LayoutRenderGate`, `MuseumScene` (`showArchitecture={false}`), `LayoutPreviewScene`, `EditorGrid`; then `{#if layoutInteraction.viewMode === 'plan'}` `<LayoutPlanViewport/>` overlay `{/if}`.
   - non-layout branch: `EditorViewportToolbar` + `<Canvas>` containing `MuseumScene` (`showArchitecture`), `EditorGrid`, `EditorCameraPathHelpers`, `EditorCameraViewHelpers`, `EditorCameraFramingHelpers`, node helpers, `EditorSelection`, `EditorPlacementTools`, `EditorSelectionHelper`, `EditorTransformControls`, `PlacementGhost`.
3. Add `z-index: 3` to `.plan-viewport` in `LayoutPlanViewport.svelte` so it stacks above the in-flow Canvas and captures pointer events.
4. Verify: `npm run check -w @portfolio/museum` → 0 errors; browser QA (toggle persistence, plan drafting/snapping/opening drag/room-vertex edit/object drag, 3D object selection, re-measure switch timing).
5. Commit.

## Task 3 — Shared bucketed wall/floor materials

**Files:**
- Create: `apps/museum/src/lib/editor/layout/layout-wall-material.ts`
- Create: `apps/museum/src/lib/editor/layout/layout-wall-material.test.ts`
- Modify: `apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte:63-144`

**Interfaces:**
- Produces: `WallMaterialKey`, `wallSectionMaterialKey(args)`, `wallMaterialForKey(key)`, shared `WALL_MATERIAL_DEFAULT` / `WALL_MATERIAL_WALL_SELECTED` / `WALL_MATERIAL_OPENING_SELECTED`, `FLOOR_MATERIAL`.
- Consumes: `CompiledWallSection.openingId`, `WallPreview.segmentId`; selection props.

TDD order:
1. Write failing test `layout-wall-material.test.ts` (opening wins over wall; wall fallback; default; key→instance mapping).
2. Run: `npm run test -w @portfolio/museum -- layout-wall-material` → FAIL.
3. Write module (see session plan for full code): three shared `MeshStandardMaterial` instances, `FLOOR_MATERIAL`, `wallSectionMaterialKey`, `wallMaterialForKey`.
4. Run test → PASS.
5. Wire into `LayoutPreviewScene.svelte`: import shared instances/helpers; floor mesh uses `material={FLOOR_MATERIAL}`; wall chord meshes compute `materialKey` and use `material={wallMaterialForKey(materialKey)}`, removing the per-chord `<T.MeshStandardMaterial>`.
6. Verify: `npm run check -w @portfolio/museum` → 0 errors; `npm run test -w @portfolio/museum` full suite green; browser QA highlights identical (default `#a99d89`, wall `#d6b35f`, opening `#f1d99a`); object count drops from ~(chords×materials) to ~(chords + 4).
7. Commit.

## Out of scope

- G4 procedural meshes (chord-box topology fix).
- G3 performance harness budgets.
- Visitor runtime (`LayoutMuseumShell`).
- Ceiling material sharing (deferred — few rooms, reactive to `showCeilings`).