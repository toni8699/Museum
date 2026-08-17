# Editor debugging playbook

Short map of where a failure class lives and the cheapest way to reproduce it.
The editor is three layers: **store** (headless data), **render** (Svelte/Threlte
pixels), and **Three event ordering** (TransformControls lifecycle glue). A bug
almost always lives in exactly one of them — isolate it before theorizing.

## Decision tree

1. Run the headless adapter repro (store layer). If the **document value is
   wrong** after `begin → preview → commit`, it's a store bug — stop there.
2. If the document is **correct but the pixels are wrong** (e.g. "visually
   scales then snaps back"), it's a render race — go to the browser.
3. If the session is `null` when it shouldn't be, or begin/preview/commit/cancel
   fire twice / out of order, it's event-ordering — drive the host controller.

Work the boundary between what works and what doesn't. Don't re-derive a layer
that a passing repro already cleared.

## Layer 1 — Store / persistence

Lives in:

- `gizmo/scene-gizmo-adapter.svelte.ts` (preview/commit/cancel)
- `editor-transform.ts` (`placementTransformFromObject`, `writePlacementTransform`,
  `enforceUniformObjectScale`)
- `editor-cluster-transform.ts` (`applyRigidPivotDelta`, `snapPivotRoomLocal`)
- `store/placement-cluster-mutator.svelte.ts` (`updatePlacementTransform`,
  `stashPlacementScaleVector`)
- `store/history-controller.svelte.ts` + `store/document-store.svelte.ts`
  (`replace` → `resolveSceneDocument`)

Cheapest repro: a vitest test driving `createSceneGizmoAdapter` against
`createFixtureEditorStore` (from `tests/lib/editor/editor-test-utils.ts`) with
registered roots. Assert **both** `store.document.entities[i]` and the resolved
`store.scene.entities[i]` after commit — the document and the runtime scene are
separate objects and can disagree.

```bash
# from apps/museum
npx vitest run tests/lib/editor/gizmo/scene-gizmo-adapter.test.ts
```

## Layer 2 — Render / reactive race

Lives in:

- `h1/H13DView.svelte` — `placementRegistry.getPlacementScale`
- `EditorMuseumEntities.svelte` — `editorScale`
- `museum/EditorPlacementRoot.svelte` — `<T.Group {position} {rotation} {scale}>`
- Threlte `T` + `useProps` (scalar props are memoized; arrays always re-apply)

The trap that caused the scale snap-back: `getPlacementScale` reads the **live
document** (`store.document.entities`), while `position`/`rotation` props read
the **stale scene clone**. When a gizmo adapter mutates the live Three.js root
*and* writes the document per frame, those two writers race and the reactive
prop re-binds the root on release.

Cheapest repro: the browser (store tests cannot see effect-flush timing).

```bash
npm run dev   # from apps/museum
```

Then drag the scale gizmo and check the Three root scale against the sidebar
value. For a scriptable repro, temporarily expose the store on `window` in
`H1EditorApp.svelte` and inspect `store.document` / the registered root after
the drag.

Rule: gizmo adapters preview through a transient (mutate only the preview), and
write the document once on commit. `scene-gizmo-adapter` and
`layout-gizmo-adapter` now both follow this; don't reintroduce per-frame
document writes.

## Layer 3 — Three event ordering

Lives in:

- `gizmo/editor-gizmo-host-controller.ts` (`onControlsMouseDown/ObjectChange/MouseUp/DraggingChanged`)
- `gizmo/EditorTransformControlsHost.svelte` (the listener wiring)

TransformControls order to remember:

- pointer down → `dragging-changed(true)` **then** `mouseDown` (so `this.session`
  is still `null` when `dragging-changed(true)` fires — `begin` happens in `mouseDown`)
- pointer move → `change` **then** `objectChange`
- pointer up → `mouseUp` **then** `dragging-changed(false)` + `change`
- `axis` and `dragging` are property setters that each dispatch a `change`

Cheapest repro: fake controls through the host controller — no Three/DOM needed.

```bash
npx vitest run tests/lib/editor/gizmo/editor-gizmo-host.test.ts
```

## Layer 4 — Selection / domain routing

Lives in:

- `h1/active-editor-selection.svelte.ts` (`deriveActiveSelection`)
- `store/interaction-fsm.ts` (`reduce`) + `store/editor-interaction-store.svelte.ts`
- `EditorTransformControls.svelte` (composer adapter resolution)

Cheapest repro: vitest on the pure mapping and adapter resolution.

```bash
npx vitest run tests/lib/editor/h1/active-editor-selection.test.ts \
  tests/lib/editor/store/editor-interaction-store.test.ts \
  tests/lib/editor/gizmo/editor-gizmo-policy.test.ts
```

## Layer 5 — Layout domain

Lives in `gizmo/layout-gizmo-target.ts` (delta math),
`gizmo/layout-gizmo-candidate.ts` (validation + candidate build),
`gizmo/layout-gizmo-adapter.svelte.ts` (session + atomic commit).

```bash
npx vitest run tests/lib/editor/gizmo/layout-gizmo-target.test.ts \
  tests/lib/editor/gizmo/layout-gizmo-candidate.test.ts \
  tests/lib/editor/gizmo/layout-gizmo-adapter.test.ts
```

## Landmines that look like other layers

- **Scale near 1 writes nothing.** `writePlacementTransform` deletes
  `placement.scale` when the collapsed scalar is within `1e-6` of `1.0`. A drag
  that "does nothing" can be this, not a commit failure.
- **Document mutation does not re-render the scene.** `store.scene` is
  `$state.raw`, reassigned only by `documentStore.replace()`. Deep `$state`
  writes to `store.document` do **not** re-render `EditorMuseumEntities`.
- **Uniform vs independent scale use different persistence.** Uniform writes
  `placement.scale` (scalar); independent writes the average scalar and keeps
  the per-axis vector in session memory only (`stashPlacementScaleVector`).
- **`documentsMatch` no-op detection is JSON equality.** A write that lands on
  the same value commits nothing by design.

## Typecheck

```bash
npm run check   # from apps/museum — svelte-check
```
