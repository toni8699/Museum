# Phase 6.1 — Gizmo + Selection Interaction Parity

**Date:** 2026-08-08
**Status:** Awaiting user review
**Parent plan:** [`../../plans/museum-editor-workspace/README-museum-editor.md`](../../plans/museum-editor-workspace/README-museum-editor.md) — Phase 6 (pre-plan; this design doc *is* the Phase 6.1 plan)
**Prior slice:** [`../../agent-handoffs/phase-5.4.md`](../../agent-handoffs/phase-5.4.md) (Phase 5.4 — binary upload + package export shipped)
**Carry-over repo context:** [`../../CAMERA_AND_LAYOUT.md`](../../CAMERA_AND_LAYOUT.md) for the camera/scene contract; [`../../AGENTS.md`](../../AGENTS.md) for repo-wide conventions.

## Goal

Bring select / move / rotate / scale interaction up to what Unity, Unreal, and Blender users already know, so the editor needs zero onboarding for anyone who has touched a 3D tool before. Phase 6.1 ships the **interaction core**: a clean state machine (Idle / Hover / Selected / Dragging), gizmo defaults that match 3D-tool conventions (Translate on fresh selection; per-mode Space; Ctrl-snap modifier), selection + hover outlines, click rules (Shift add / Ctrl toggle / Empty deselect / Esc revert-and-deselect), and a per-drag undo entry.

Phase 6.2 (next slice, separate design doc) ships the **settings UI** — configurable snap defaults, the multi-select pivot "Active Object" mode, and the proper OBB outline that rotates with the object. Phase 6.3 will add marquee / box-select and the multi-select "Individual Origins" pivot.

## Scope

### Includes (Phase 6.1)

1. New `interaction-fsm.ts` pure reducer covering Idle / Hover / Selected / Dragging and the events that move between them.
2. New `editor-interaction-store.svelte.ts` sub-store mirroring the existing `history-controller` / `selection-store` / `mutation-guards` pattern. Holds FSM state, current mode (translate/rotate/scale), current Space (world/local), drag snapshot, computed cursor string.
3. `EditorSelectionHelper.svelte` finished AABB-sync — per-frame `box.setFromObject(root)` feeds `Box3Helper.box.copy(box)`; visitor-preview gate extends to its hover helper.
4. New hover helper: dim white half-opacity `Box3Helper` showing the placement under pointer — Unity-grade clickability affordance.
5. `EditorTransformControls.svelte` initial mode = `translate` on each new selection-set; Space = `world` for translate/scale + `local` for rotate on single-select, `world` for multi-select; reset on selection change. Snap = `controls.setTranslationSnap(step)` only while Ctrl/Cmd held; default off. `dragging-changed` listener drives FSM `Dragging` state and pre-drag snapshot capture.
6. `EditorSelection.svelte` — click-to-select respects Shift (add), Ctrl/Cmd (toggle), no modifier (select only). Empty-click deselects. Click is suppressed while `controls.dragging === true`.
7. `EditorViewport.svelte` — pointermove listener on the canvas, rAF-throttled, raycasts placements only (camera path entities excluded), feeds hover events to the FSM, and writes the computed cursor (`default` / `pointer` / `grabbing`) onto the canvas container.
8. `hooks/shortcuts.svelte.ts` — W / E / R / T (Translate / Rotate / Scale / reset-Translate), X (toggle Space for current mode), Esc (cancel + deselect). Existing Cmd+Z / Cmd+Shift+Z preserved.
9. `EditorViewportToolbar.svelte` — snap-hint copy changes from "Hold Shift while dragging to bypass snapping" to "Hold Ctrl/Cmd while dragging to snap".
10. `session-state.svelte.ts` — adds `setScaleSnap`; rotate snap default degree changes from 45° to 15°; all snap modes default disabled on first load.
11. Visitor preview parity preserved: helpers hidden on visitor preview; FSM events still fire on visitor (state machine runs in idle), only visuals are suppressed; no `/local/...` URIs or editor modules reach the visitor chunk graph.

### Excludes (deferred to later slices)

- **OBB outline** that rotates with the object via local box corners + world matrix — Phase 6.2.
- **Snap settings UI** (toggle panel with configurable defaults + step) — Phase 6.2.
- **Multi-select "Active Object" pivot mode** — Phase 6.2.
- **Pivot "Individual Origins"** rotation for multi-select — Phase 6.3.
- **Marquee / box-select** — Phase 6.3.
- Filesystem Save, account persistence, networked sync.
- New runtime dependencies. Three's stock `TransformControls` is enough; no `DragControls` or tool palettes.
- Touch / pen / pressure input navigation — the museum editor is keyboard + mouse only.

## Locked decisions (Q1–Q10)

The following were resolved via one-question-at-a-time dialogue and are not reopenable in this design unless a contradiction is found during review.

| # | Question | Decision |
|---|---|---|
| Q1 | Phasing | **Two slices.** 6.1 = interaction core (immediate fixes + sections 1, 2, 3, 4, 7, 8 click rules, 9, 10). 6.2 = settings UI + Active Object pivot (section 5 + section 6 panel). |
| Q2 | OBB outline | **AABB-sync stopgap** in 6.1 (immediate fix #1 finished cleanly). OBB queued for 6.2 — "AABB reshapes under rotation" surfaced as known limitation. |
| Q3 | Snap modifier | **Ctrl/Cmd while dragging to snap**; snap default off; Shift loses its snap-bypass meaning; existing `EditorViewportToolbar` UI text reverts. |
| Q4 | Hover scope | **All placement roots** — primitives + model assets + lights. Camera-tree / path-anchor entities keep their own dedicated `EditorCameraPathHelpers` hover and are not double-hovered. |
| Q5 | Default mode on selection | **Every new selection-set resets to Translate.** Pressing R sticks until the next selection-set boundary. |
| Q6 | Transform-space UI | **X keybind only.** Per-mode default (Translate/Scale → World, Rotate → Local single-select). Multi-select always World. Reset on selection. |
| Q7 | Hover outline visual | **Dim white half-opacity** (`#ffffff`, alpha ≈ 0.35). Distinct from selected-gold; reads as soft pre-selection. |
| Q8 | Esc mid-drag | **Revert + deselect.** Drag cancelled, pre-drag transform restored, selection cleared. Unity-grade; one keystroke closes the loop. |
| Q9 | Cursor over placement | **Pointer / hand cursor** in addition to hover outline. Maximum "clickable" affordance. |
| Q10 | Architecture home | **New `editor-interaction-store.svelte.ts` sub-store.** Mirrors the existing `history-controller` / `selection-store` / `mutation-guards` pattern. Pure reducer logic lives in a sibling `interaction-fsm.ts` for testability. |

## Architecture

### New files

| Path | Role |
|---|---|
| `apps/museum/src/lib/editor/store/interaction-fsm.ts` | Pure FSM. Exports `FSMState`, `FSMEvent`, and `reduce(state, event) → { state, sideEffects }`. No `$state` runes — just a plain function with a small enum. |
| `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts` | Reactive sub-store. Holds `state`, `mode`, `space`, `hoverTargetId`, `dragSnapshot`, `cursor`. Exposes typed commands: `dispatch(event)`, `setMode(mode)`, `toggleSpace()`, `setHoverTarget(id\|null)`, `captureDragSnapshot()`, `restoreDragSnapshot()`. |
| `apps/museum/src/lib/editor/interaction-cursor.ts` | Pure helper: `computeCursor({state, hoverTargetId, isGizmoDraggingSpace}) → 'default' \| 'pointer' \| 'grabbing'`. Side-effect-free; trivially testable. |

### Modified files

| Path | Change |
|---|---|
| `apps/museum/src/lib/editor/EditorSelectionHelper.svelte` | Switch `BoxHelper` → `Box3Helper(box)`. Per-frame `box.setFromObject(root)` and `helper.box.copy(box)`. Add a parallel hover helper for the FSM's hover target id. Visitor-preview gate extended to hover helper. |
| `apps/museum/src/lib/editor/EditorTransformControls.svelte` | `$effect(selectionKey)` → `controls.setMode('translate')` + `controls.setSpace(perModeDefault(selectionSize, mode))`. Add `dragging-changed` listener. Add Ctrl/Cmd keydown / keyup listeners that flip snap on/off via `controls.setTranslationSnap(step)`. Esc handler in cooperation with `interactionStore.dispatch({ type: 'ESC' })`. |
| `apps/museum/src/lib/editor/EditorSelection.svelte` | Click handler guards against `controls.dragging === true`. Modifier dispatch: shift = add, ctrl/cmd = toggle, none = select-only. Empty-click deselects. |
| `apps/museum/src/lib/editor/EditorViewport.svelte` | Register `pointermove` listener on canvas. rAF-throttle. Raycast against `store.getPlacementRoots()` only (camera tree filtered). Push `dispatch({ type: 'POINTER_MOVE', target })`. Set `canvasContainer.style.cursor = interactionStore.cursor`. |
| `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts` | Existing Cmd+Z / Cmd+Shift+Z preserved. New W / E / R / T / X / Esc handlers, all gated by `event.target` not being a text input. |
| `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` | Snap-hint text updated. Current-mode indicator bound to `interactionStore.mode`. |
| `apps/museum/src/lib/editor/store/session-state.svelte.ts` | Add `setScaleSnap(step)`. Default translate snap = disabled. Default rotate snap = disabled, default degree = 15°. Default scale snap = disabled, default step = 0.1. |

### Pure types

```ts
// interaction-fsm.ts
export type FSMState = 'Idle' | 'Hover' | 'Selected' | 'Dragging';

export type FSMEvent =
  | { type: 'POINTER_MOVE'; target: PlacementId | null }
  | { type: 'CLICK'; target: PlacementId | null; shift: boolean; meta: boolean }
  | { type: 'ESC' }
  | { type: 'KEY_W' | 'KEY_E' | 'KEY_R' | 'KEY_T' | 'KEY_X' }
  | { type: 'SELECTION_SET_CHANGE'; size: number }
  | { type: 'DRAG_START'; pivot: EditorSelectionPivot }
  | { type: 'DRAG_END'; cancelled: boolean };

export interface SideEffect {
  apply(store: EditorInteractionStore, document: Document): void;
}

export function reduce(state: FSMState, event: FSMEvent): { state: FSMState; effects: SideEffect[] };
```

```ts
// editor-interaction-store.svelte.ts
export interface DragSnapshot {
  placementIds: string[];
  transforms: { id: string; position: Vector3; quaternion: Quaternion; scale: Vector3 }[];
}

export class EditorInteractionStore {
  state: $state<FSMState>('Idle');
  mode: $state<'translate' | 'rotate' | 'scale'>('translate');
  space: $state<'world' | 'local'>('world');
  hoverTargetId: $state<PlacementId | null>(null);
  dragSnapshot: $state<DragSnapshot | null>(null);
  cursor: $state<'default' | 'pointer' | 'grabbing'>('default');

  dispatch(event: FSMEvent): void;
  setMode(mode: 'translate' | 'rotate' | 'scale'): void;
  toggleSpace(): void;
  setHoverTarget(id: PlacementId | null): void;
  captureDragSnapshot(): void;
  restoreDragSnapshot(): void;
}
```

### Visitor preview gate

`EditorSelectionHelper.svelte` already gates helper construction against the visitor preview flag. Phase 6.1 extends that single gate to both the selection AABB helper AND the new hover helper. The FSM continues to run during visitor preview (canvas raycast + hover state updates) — only visuals are hidden. This keeps the code simple (no event suppression inside the FSM) and is one gate for both helpers.

## State machine

### States

| State | Cursor | Helpers shown |
|---|---|---|
| `Idle` | `default` | none |
| `Hover` | `pointer` | hover helper on the placement under cursor only |
| `Selected` | `default` over empty, `pointer` over unselected placement | selection helper on each member of current selection |
| `Dragging` | `grabbing` over gizmo handle; hover helper frozen | selection helpers visible |

### Transition table

Every cell shows `next state` after the event:

| State | POINTER_MOVE null | POINTER_MOVE target | CLICK null | CLICK target | SHIFT+CLICK | CTRL/CMD+CLICK | DRAG_START | DRAG_END | ESC |
|---|---|---|---|---|---|---|---|---|---|
| **Idle** | — | `Hover` | — | `Selected` | — | — | — | — | — |
| **Hover** | `Idle` | `Hover` | `Idle` | `Selected` | `Selected + add` | `Selected toggle` | — | — | `Idle` |
| **Selected** | — | `Selected` (hover frozen) | `Idle` | `Selected` (no-op) | `Selected + add` | `Selected toggle` | `Dragging` | `Selected` | `Idle` |
| **Dragging** | — | — | — | — | — | — | no-op | `Selected` | `revert + Idle` |

### Pre-drag snapshot

```
DRAG_START:
  dragSnapshot = {
    placementIds: [...store.selection],
    transforms:   placementIds.map(id => placementTransformSnapshot(id))
  }

DRAG_END cancelled=false:
  historyController.beginDocument()
  // existing placement-mutator path commits the per-mesh edits
  historyController.commitDocument()
  // exactly one history entry per drag.

DRAG_END cancelled=true:
  dragSnapshot.transforms.forEach(s => writeBack(s))
  // no history entry
```

### Esc mid-drag revert — implementation tactic

Three's `TransformControls` does not expose a public `cancelDrag()` method. Phase 6.1 implements revert via:

1. Restore placement transforms from `dragSnapshot` (the same `transforms` array used in non-cancelled `DRAG_END`).
2. Set `controls.dragging = false` (private flag on Three's `TransformControls`; works in current Three r170).
3. Dispatch synthetic `dragging-changed` event with `value: false`, so Three releases pointer capture.
4. Call `store.deselectAll()` so the FSM transitions to `Idle`.

Integration test pins `state === 'Idle' AND dragSnapshot transforms restored`. If a future Three release breaks step 2/3, fall back to detach + re-attach (`controls.detach(); controls.attach(newPivot)`); integration test still pins the assertion.

## Helper visualization

### Selection helper — finished AABB-sync

`BoxHelper`'s behaviour was misaligned during ongoing transforms: it was rebuilt off `selectionKey` change only, so any drag-as-you-go movement showed it desynced from the moving mesh. Phase 6.1 finishes the migration to `Box3Helper`:

```
per-frame useTask:
  for { root, box, helper } of records:
    box.makeEmpty()
    box.setFromObject(root)
    helper.visible = !box.isEmpty()
    // `Box3Helper` reads its `.box` field directly each render —
    // no `helper.position.copy(box.getCenter())` + `helper.scale.copy(box.getSize())`
    // plumbing needed; the wireframe geometry samples `.box` automatically.
```

Properties retained from the existing helper:
- `helper.raycast = () => null` ⇒ never intercepts clicks.
- `helper.material.depthTest = false` ⇒ line is visible through any occluding geometry.
- `helper.renderOrder = 1000` ⇒ drawn last.
- `helper.frustumCulled = false` ⇒ never culled out of view.

### Hover helper — new

A second parallel `Box3Helper` keyed on the FSM's `hoverTargetId`:

```
on $effect(hoverTargetId):
  dispose any prior hover helper.
  if hoverTargetId === null: return.
  const root = getPlacementRoot(hoverTargetId)
  const box = new Box3()
  const helper = new Box3Helper(box, 0xffffff)
  helper.material.opacity = 0.35
  helper.material.transparent = true
  helper.material.depthTest = false
  helper.renderOrder = 999
  helper.frustumCulled = false
  helper.raycast = () => null
  scene.add(helper)

in useTask:
  if hover record present:
    box.setFromObject(root)
    helper.visible = !box.isEmpty()
```

Same visitor-preview gate as the selection helper. Hover helper does NOT need raycast-null because it never has a parent's transform delta to disagree with — but the `raycast = () => null` is kept uniform anyway.

## Gizmo defaults + keybinds + transform space

### Default mode on every new selection-set

```
$effect(selectionKey):             // Q5
  controls.setMode('translate')
  if (selectionSize === 0)
    controls.detach()
  else
    controls.attach(EditorSelectionPivot)
```

The `selectionKey` reactive dependency ensures mode resets whenever the user forms a new selection set, regardless of whether it was reached via click, shift-click, ctrl-click, outliner click, or primitive placement.

### Transform space per mode

```
$effect(selectionSize + mode):
  if (selectionSize <= 1) {
    controls.setSpace(mode === 'rotate' ? 'local' : 'world')
  } else {
    controls.setSpace('world')    // Q6 — multi-select always World
  }
```

`local` for rotate on single-select matches "spin it around its own axis". `local` for translate/scale is the Unity default — every other mainstream engine is `world` for translate/scale and the editor ships its default there.

### Keybinds

```
hooks/shortcuts.svelte.ts:
  ignorelist: text inputs, contenteditable, range/number, focused slider
  on keydown:
    'w' → interactionStore.setMode('translate')
    'e' → interactionStore.setMode('rotate')
    'r' → interactionStore.setMode('scale')
    't' → interactionStore.setMode('translate')    // alias of W
    'x' → interactionStore.toggleSpace()
    'Escape' → interactionStore.dispatch({ type: 'ESC' })
```

Existing Cmd+Z / Cmd+Shift+Z handlers preserved unchanged.

### Snap — Ctrl/Cmd opt-in modifier

```
EditorTransformControls — listen for keydown/keyup on window:
  if event.ctrlKey || event.metaKey:
    controls.setTranslationSnap(sessionState.translateSnapStep)
    controls.setRotationSnap(degreesToRadians(sessionState.rotateSnapDegrees))
    controls.setScaleSnap(sessionState.scaleSnapStep)
  else (snap modifier released):
    controls.setTranslationSnap(0)
    controls.setRotationSnap(0)
    controls.setScaleSnap(0)
```

`EditorViewportToolbar.svelte`'s hint text changes from "Hold Shift while dragging to bypass snapping" to "Hold Ctrl/Cmd while dragging to snap".

### Snap defaults on first load

| Setting | Default | Source |
|---|---|---|
| Translate snap enabled | off | `sessionState` |
| Translate snap step | 0.25 m | `sessionState` (already exists) |
| Rotate snap enabled | off | `sessionState` |
| Rotate snap degrees | 15° | `sessionState` (already exists; default changed from 45°) |
| Scale snap enabled | off | `sessionState` |
| Scale snap step | 0.1 | `sessionState` (new `setScaleSnap`) |

UI panel for these (configurable defaults / step) deferred to Phase 6.2 settings work.

## Undo + visitor parity + DOM cursor + polish

### Undo shape

- One drag = one history entry, regardless of frame count inside the drag.
- Snapshot captured on `DRAG_START`, restored on `DRAG_END cancelled=true`.
- Inspector field edits during drag do NOT push a separate history entry — the field write goes through the existing `placement-cluster-mutator.transformBy(...)` path, which does not call `beginDocument()` mid-drag.
- Inspector field edits OUTSIDE drag commit one entry per blur/enter via the existing precision-field workflow.

### Visitor parity

- Helpers hidden via existing `EditorSelectionHelper.svelte` `isVisitorPreview` gate (extended to hover helper this slice).
- Gizmo detached while preview active (existing `onVisitorPreviewChange` listener, Phase 4).
- FSM events keep firing on visitor preview — only visuals are hidden.
- `/local/...` URI isolation, editor chunk isolation, and binary-object-URL hygiene all preserved from Phase 5.4 — no regression risk in 6.1.
- Post-implementation verification: `grep -rE 'museum-editor' apps/museum/.svelte-kit/output/client/_app/immutable/...` against visitor chunks must return zero matches.

### DOM cursor swap

```
EditorViewport.svelte reactive cursor:
  computed =
    (interactionStore.state === 'Dragging') ? 'grabbing'
    : (interactionStore.hoverTargetId ? 'pointer')
    : (interactionStore.state === 'Hover' ? 'pointer')
    : 'default'
  canvasContainer.style.cursor = computed
```

Three's `TransformControls` already renders its own cursor on its gizmo handles (the handles intercept the pointer event). Our container-level cursor wins when the pointer is NOT over a gizmo handle; Three's cursor wins while the gizmo handle is under the pointer.

### Polish captures

- Current-mode icon in `EditorViewportToolbar` bound to `interactionStore.mode`.
- Gizmo handle highlight on hover (Three default — confirmed not overridden).
- Inspector precision fields (existing in `EditorTransformInspector`) live-update during drag, do not push history entries mid-drag.
- Outliner click pipeline unchanged.
- Camera path entities continue to use `EditorCameraPathHelpers`; not double-hovered, not double-selected.

## Tests

### New unit tests

| File | Coverage | Approx tests |
|---|---|---|
| `apps/museum/src/lib/editor/store/interaction-fsm.test.ts` | Pure reducer: 4 states × 9 events = 36 transitions; invariant cases (ESC mid-drag, CLICK null, POINTER_MOVE null) | ~25 |
| `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts` | `dispatch` mutates state, `setMode`, `toggleSpace`, `dragSnapshot` capture/restore round-trip, `cursor` getter for every FSM state × hover target | ~12 |
| `apps/museum/src/lib/editor/EditorSelectionHelper.test.ts` (new) | AABB-sync: `setFromObject` → `helper.box` matches; hover helper add/dispose; visitor gate; depthTest + renderOrder + raycast null on both helpers | ~10 |

### Existing tests — keep green

`museum-editor.test.ts`, `museum-editor-selection.test.ts`, `museum-editor-placement.test.ts`, `museum-editor-camera.test.ts`, `museum-editor-framing.test.ts`, `museum-editor-shell.test.ts`, `museum-editor-bind-migration.test.ts`, `history-controller.test.ts`, `session-state.test.ts`, `texture-library-controller.test.ts`, every Phase 5.x artifact test.

### Integration assertions

- Selection click → `selectionKey` updates, FSM = `Selected`.
- Shift+click → selection grows; FSM stays `Selected`.
- Esc on idle → FSM = `Idle`; selection cleared.
- Esc mid-drag → FSM = `Idle`; transforms restored; no new history entry.
- `dragging-changed true` → FSM = `Dragging`; `dragSnapshot` populated; FSM state observable.
- `dragging-changed false` (clean release) → FSM = `Selected`; exactly +1 history entry.
- Visitor preview mount → helpers absent; FSM events still fire.
- Inspector field edit during drag → placement transform updated; history untouched.

### Manual walkthrough

Written into `docs/agent-handoffs/phase-6.1-test-cookbook.md` after the implementation is green, listing the same 10 manual checks as the integration assertions but in human steps.

| Step | Expected |
|---|---|
| W / E / R / T | mode cycles translate → rotate → scale → translate; selection highlight turns placement tools |
| X | space cycles World ↔ Local; rotate-Local shows object-aligned rings |
| Click placement | gold AABB, hover-helper off, selection helper on; gizmo translate-at-centroid |
| Empty click | FSM → Idle, selection cleared |
| Shift+click | multi-select; shared centroid; single shared gizmo |
| Esc (idle) | selection cleared |
| Drag + Esc | gizmo destroys, transforms unchanged, selection cleared |
| Ctrl/Cmd drag | snap enabled mid-drag (visible jumps to grid) |
| Visitor preview | helpers vanish; visitor chunk graph clean; no `/local/...` URIs |
| Orbit drag | unaffected by hover / click pipeline |

## Out of scope (deferred)

| Item | Plan |
|---|---|
| OBB outline (proper rotation with object) | Phase 6.2 |
| Snap settings UI panel (configurable default + step) | Phase 6.2 |
| Multi-select pivot "Active Object" mode | Phase 6.2 |
| Pivot "Individual Origins" rotation for multi-select | Phase 6.3 |
| Marquee / box-select | Phase 6.3 |
| Pressure / touch / pen input | out of scope; mouse + keyboard only |
| Networked sync, account persistence | out of scope |
| Filesystem Save | out of scope (still text-only / package export) |

Known limitations carried into 6.1 release notes:

| Limitation | Origin | Where it lands |
|---|---|---|
| AABB reshapes under rotation | Q2 / stopgap | OBB → 6.2 |
| Snap settings UI is a single snap-enabled toggle | Q3 / snap-by-mod | Settings panel → 6.2 |
| Multi-select pivot = Center only | Q5 | Active Object → 6.2 |
| Marquee / box-select absent | section 8 / phase-2-flagged | 6.3 |
| `controls.dragging = false` is a Three private-flag workaround | §4 / Esc tactic | Three 6.x public API, or fall back to detach-rebuild |

## Ship criteria

| Gate | Threshold |
|---|---|
| Vitest | 100% pass; no new failures |
| New tests added | ~47 (FSM 25 + sub-store 12 + helper 10) |
| `npx svelte-check --output machine` | 0 errors / 0 warnings |
| `npm run build -w @portfolio/museum` | exit 0 |
| Visitor-parity grep | no editor modules in visitor chunk graph |
| Manual walkthrough | all 10 cookbook items pass |
| Read-only chunks (visitor `/museum`) | unaffected; works as before |

## Slice plan

For the `writing-plans` step (next): ticket breakdown — Phase 6.1 ≈ 7 task cards.

1. Pure `interaction-fsm.ts` + tests.
2. `editor-interaction-store.svelte.ts` + tests.
3. `EditorSelectionHelper.svelte` — AABB-sync via `Box3Helper` + per-frame `setFromObject` + new hover helper + visitor gate.
4. `EditorTransformControls.svelte` — Translate on selection-set; per-mode Space defaults; `dragging-changed` FSM hooks; Esc handler; Ctrl/Cmd snap modifier.
5. `EditorSelection.svelte` — click-rule gate (Shift add, Ctrl toggle, empty deselect); drag-suppress early-return.
6. `EditorViewport.svelte` — pointermove raycast listener (rAF-throttled) feeding hover events; `cursor` swap; visitor quiet-mode.
7. `hooks/shortcuts.svelte.ts` + `EditorViewportToolbar.svelte` + `session-state.svelte.ts` — keybinds W/E/R/T/X/Esc; UI text update; `setScaleSnap` new setter; snap defaults off.

Followed by `6.1.5` = manual walkthrough + handoff doc (`docs/agent-handoffs/phase-6.1.md`) + visitor chunk-isolation grep + `phase-6.2` plan-pointer update.

## Acceptance criteria

Phase 6.1 ships when:

1. All vitest gates green; `npx svelte-check` 0/0; `npm run build -w @portfolio/museum` exit 0.
2. Manual walkthrough (10 items) green.
3. Visitor chunk graph: zero editor modules; zero `/local/...` URIs.
4. Editor `/dev/museum-editor` route boots clean; selection, gizmo, snap, keybinds, undo/redo interact correctly.

## Open questions deferred

None. The 10 design-driving questions have been locked. Outstanding implementation tactics surfaced at write-time (Cursor swap layering with Three's gizmo cursor; `controls.dragging = false` private workaround) are flagged as known limitations above and tracked for Phase 6.2 if they become problematic.
