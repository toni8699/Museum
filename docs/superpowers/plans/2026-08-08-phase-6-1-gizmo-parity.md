# Phase 6.1 Gizmo + Selection Interaction Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring select / move / rotate / scale interaction up to Unity-grade parity. Ship a Hover / Selected / Dragging FSM, a per-frame `Box3Helper`-synced selection outline, a new dim-white half-opacity hover outline, click rules (Shift add / Ctrl toggle / empty deselect / Esc revert-and-deselect), Translate default + per-mode Space + drag-snap via Ctrl/Cmd modifier, and one-undo-entry-per-drag.

**Architecture:** A pure `interaction-fsm.ts` reducer drives all state mutations; a Svelte 5 reactive `editor-interaction-store.svelte.ts` sits underneath `EditorSelectionHelper`, `EditorTransformControls`, `EditorSelection`, `EditorViewport`, and the existing `hooks/shortcuts` keybind dispatcher. `Box3Helper` instances are attached to the scene root (not as children of the placement root) and read their `.box` field each frame, so visibility tracks the placement's world bounds without per-frame `helper.update()` plumbing. The FSM keeps running during visitor preview; visuals gate on the existing `isVisitorPreview` flag.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3, Three.js / Threlte 7 (no new runtime deps).

## Global Constraints (every task must satisfy)

- **No new runtime dependencies.** No new packages; `Three.TransformControls` is sufficient.
- **Existing test suite stays green.** The 791-test baseline (`Test Files 57 passed`) is preserved. New tests must add to that baseline without any previously-green test flipping red.
- **No commits per `AGENTS.md`.** Plan steps call `verify gates` rather than `commit`.
- **Visitor chunk isolation preserved.** No editor modules appear in `/museum` visitor chunk graph (regression on Phase 5.4 invariant).
- **`/local/...` URIs never reach visitor.** Binary store, package-exporter, and editor modules stay out of visitor paths.
- **Visitor preview parity.** All editor helpers (selection + hover) hide on visitor preview via the existing `isVisitorPreview` gate.
- **No new public surface changes to existing public APIs.** `registerPlacementRoot`, `selectedPlacementIds`, `selectionKey`, `selectedClusterId`, `selectionActions.deselect`, history-controller `beginDocument`/`commit`, session-state setters — all unchanged in signature.
- **Verification command** (every task that adds or modifies code):
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```
  Production build only at end-of-slice verification.

## File Structure (locked)

| Path | Type | Role |
|---|--:|---|
| `apps/museum/src/lib/editor/store/interaction-fsm.ts` | NEW | Pure FSM reducer. No `$state`, no Three imports. |
| `apps/museum/src/lib/editor/store/interaction-fsm.test.ts` | NEW | Matrix-driven transition assertions + invariant cases. |
| `apps/museum/src/lib/editor/interaction-cursor.ts` | NEW | Pure helper `computeCursor(state, hoverTargetId) → 'default' \| 'pointer' \| 'grabbing'`. |
| `apps/museum/src/lib/editor/interaction-cursor.test.ts` | NEW | Cursor truth-table tests. |
| `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts` | NEW | Reactive sub-store. Holds `state`, `mode`, `space`, `hoverTargetId`, `dragSnapshot`. |
| `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts` | NEW | Sub-store tests: dispatch, setMode, toggleSpace, dragSnapshot round-trip, cursor getter. |
| `apps/museum/src/lib/editor/store/session-state.svelte.ts` | MODIFY | Add `setScaleSnap` + `setScaleSnapEnabled`; defaults flipped. |
| `apps/museum/src/lib/editor/store/session-state.test.ts` | MODIFY | Tests for `setScaleSnap` + disabled-defaults. |
| `apps/museum/src/lib/editor/EditorSelectionHelper.svelte` | MODIFY | Replace `BoxHelper` with `Box3Helper`; add hover helper; per-frame `setFromObject` + `box.copy`; visitor gate extended. |
| `apps/museum/src/lib/editor/EditorSelectionHelper.test.ts` | NEW | AABB-sync tests; hover helper add/dispose; visitor gate; helper property assertions. |
| `apps/museum/src/lib/editor/EditorTransformControls.svelte` | MODIFY | `controls.setMode('translate')` on new selection-set; per-mode Space; `dragging-changed` listener → FSM dispatch; Esc handler; Ctrl/Cmd key listeners → snap enable/disable. |
| `apps/museum/src/lib/editor/EditorSelection.svelte` | MODIFY | Modifier dispatch (Shift add / Ctrl toggle / empty-click deselect); consume `interactionStore.hoverTargetId` to drive hover visualizer; pipe `selectionKey` to interactionStore. |
| `apps/museum/src/lib/editor/EditorViewport.svelte` | MODIFY | Reactive DOM cursor binding to `interactionStore.cursor`. |
| `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts` | MODIFY | Add W / E / R / T / X / Esc handlers gated on `interactionStore`. |
| `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` | MODIFY | Snap-hint text "Hold Ctrl/Cmd while dragging to snap"; mode icon bound to `interactionStore.mode`. |
| `docs/agent-handoffs/phase-6.1.md` | NEW | Slice-end handoff doc — committed at slice close, mirrors Phase 5.4 handoff structure. |

Each task below produces independently testable changes.

---

### Task 1: Pure FSM reducer + tests

**Files:**
- Create: `apps/museum/src/lib/editor/store/interaction-fsm.ts`
- Create: `apps/museum/src/lib/editor/store/interaction-fsm.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:

```ts
// apps/museum/src/lib/editor/store/interaction-fsm.ts
export type FSMState = 'Idle' | 'Hover' | 'Selected' | 'Dragging';

export type PlacementId = string;

export type FSMEvent =
  | { type: 'POINTER_MOVE'; target: PlacementId | null }
  | { type: 'CLICK'; target: PlacementId | null; shift: boolean; meta: boolean }
  | { type: 'ESC' }
  | { type: 'KEY_W' }
  | { type: 'KEY_E' }
  | { type: 'KEY_R' }
  | { type: 'KEY_T' }
  | { type: 'KEY_X' }
  | { type: 'SELECTION_SET_CHANGE' }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_END'; cancelled: boolean };

export interface SideEffect {
  apply(): void;
}

export function reduce(
  state: FSMState,
  event: FSMEvent
): { state: FSMState; effects: SideEffect[] };
```

`- [ ]` **Step 1: Write the failing test file**

```ts
// apps/museum/src/lib/editor/store/interaction-fsm.test.ts
import { describe, expect, it } from 'vitest';
import { reduce, type FSMState, type FSMEvent } from './interaction-fsm';

const STATES: FSMState[] = ['Idle', 'Hover', 'Selected', 'Dragging'];

describe('reduce — transition matrix', () => {
  const cases: Array<{ state: FSMState; event: FSMEvent; next: FSMState }> = [
    // Idle row
    { state: 'Idle', event: { type: 'POINTER_MOVE', target: null }, next: 'Idle' },
    { state: 'Idle', event: { type: 'POINTER_MOVE', target: 'p1' }, next: 'Hover' },
    { state: 'Idle', event: { type: 'CLICK', target: 'p1', shift: false, meta: false }, next: 'Selected' },
    // Hover row
    { state: 'Hover', event: { type: 'POINTER_MOVE', target: null }, next: 'Idle' },
    { state: 'Hover', event: { type: 'POINTER_MOVE', target: 'p1' }, next: 'Hover' },
    { state: 'Hover', event: { type: 'CLICK', target: 'p1', shift: false, meta: false }, next: 'Selected' },
    { state: 'Hover', event: { type: 'CLICK', target: 'p1', shift: true, meta: false }, next: 'Selected' },
    { state: 'Hover', event: { type: 'CLICK', target: 'p1', shift: false, meta: true }, next: 'Selected' },
    { state: 'Hover', event: { type: 'CLICK', target: null, shift: false, meta: false }, next: 'Idle' },
    { state: 'Hover', event: { type: 'ESC' }, next: 'Idle' },
    // Selected row
    { state: 'Selected', event: { type: 'POINTER_MOVE', target: null }, next: 'Selected' },
    { state: 'Selected', event: { type: 'POINTER_MOVE', target: 'p2' }, next: 'Selected' },
    { state: 'Selected', event: { type: 'CLICK', target: null, shift: false, meta: false }, next: 'Idle' },
    { state: 'Selected', event: { type: 'CLICK', target: 'p1', shift: true, meta: false }, next: 'Selected' },
    { state: 'Selected', event: { type: 'CLICK', target: 'p1', shift: false, meta: true }, next: 'Selected' },
    { state: 'Selected', event: { type: 'DRAG_START' }, next: 'Dragging' },
    { state: 'Selected', event: { type: 'DRAG_END', cancelled: false }, next: 'Selected' },
    { state: 'Selected', event: { type: 'SELECTION_SET_CHANGE' }, next: 'Selected' },
    { state: 'Selected', event: { type: 'ESC' }, next: 'Idle' },
    // Dragging row
    { state: 'Dragging', event: { type: 'DRAG_START' }, next: 'Dragging' },
    { state: 'Dragging', event: { type: 'DRAG_END', cancelled: false }, next: 'Selected' },
    { state: 'Dragging', event: { type: 'DRAG_END', cancelled: true }, next: 'Selected' },
    { state: 'Dragging', event: { type: 'ESC' }, next: 'Selected' }
  ];

  for (const { state, event, next } of cases) {
    it(`${state} + ${event.type} → ${next}`, () => {
      expect(reduce(state, event).state).toBe(next);
    });
  }
});

describe('reduce — invariants', () => {
  it('DRAG_END cancelled = SideEffect psuedoReverts', () => {
    const { effects } = reduce('Dragging', { type: 'DRAG_END', cancelled: true });
    expect(effects.some((e) => e.constructor.name === 'RevertDragSideEffect')).toBe(true);
  });

  it('DRAG_END non-cancelled = SideEffect commits history', () => {
    const { effects } = reduce('Dragging', { type: 'DRAG_END', cancelled: false });
    expect(effects.some((e) => e.constructor.name === 'CommitDragSideEffect')).toBe(true);
  });

  it('ESC in Idle = no-op', () => {
    const { state, effects } = reduce('Idle', { type: 'ESC' });
    expect(state).toBe('Idle');
    expect(effects).toHaveLength(0);
  });

  it('every event leaves the state field populated', () => {
    for (const state of STATES) {
      expect(reduce(state, { type: 'ESC' }).state).toBeTruthy();
    }
  });
});
```

`- [ ]` **Step 2: Run the test and confirm it fails**

Run:
```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/store/interaction-fsm.test.ts
```
Expected: FAIL — `Cannot find module './interaction-fsm'`.

`- [ ]` **Step 3: Implement `interaction-fsm.ts`**

```ts
// apps/museum/src/lib/editor/store/interaction-fsm.ts
export type FSMState = 'Idle' | 'Hover' | 'Selected' | 'Dragging';
export type PlacementId = string;

export type FSMEvent =
  | { type: 'POINTER_MOVE'; target: PlacementId | null }
  | { type: 'CLICK'; target: PlacementId | null; shift: boolean; meta: boolean }
  | { type: 'ESC' }
  | { type: 'KEY_W' | 'KEY_E' | 'KEY_R' | 'KEY_T' | 'KEY_X' }
  | { type: 'SELECTION_SET_CHANGE' }
  | { type: 'DRAG_START' }
  | { type: 'DRAG_END'; cancelled: boolean };

export interface SideEffect {
  apply(): void;
}

export class CommitDragSideEffect implements SideEffect {
  apply(): void {}
}
export class RevertDragSideEffect implements SideEffect {
  apply(): void {}
}

export function reduce(
  state: FSMState,
  event: FSMEvent
): { state: FSMState; effects: SideEffect[] } {
  const effects: SideEffect[] = [];
  let next: FSMState = state;

  switch (event.type) {
    case 'POINTER_MOVE':
      if (state === 'Idle') next = event.target ? 'Hover' : 'Idle';
      else if (state === 'Hover') next = event.target ? 'Hover' : 'Idle';
      else next = state; // Selected + Dragging keep state.
      break;
    case 'CLICK':
      if (state === 'Idle' || state === 'Hover') {
        if (event.target === null) next = 'Idle';
        else next = 'Selected';
      } else if (state === 'Selected') {
        if (event.target === null) next = 'Idle';
        else next = 'Selected';
      }
      break;
    case 'DRAG_START':
      if (state === 'Selected') next = 'Dragging';
      break;
    case 'DRAG_END':
      next = state === 'Dragging' ? 'Selected' : state;
      if (state === 'Dragging') effects.push(event.cancelled ? new RevertDragSideEffect() : new CommitDragSideEffect());
      break;
    case 'SELECTION_SET_CHANGE':
      next = state;
      break;
    case 'ESC':
      if (state === 'Dragging') {
        effects.push(new RevertDragSideEffect());
        next = 'Selected'; // FSM stays; in sub-store the deselect will dispatch a separate ESC.
      } else {
        next = 'Idle';
      }
      break;
    case 'KEY_W':
    case 'KEY_E':
    case 'KEY_R':
    case 'KEY_T':
    case 'KEY_X':
      next = state;
      break;
  }

  return { state: next, effects };
}
```

`- [ ]` **Step 4: Run the test and confirm it passes**

Run the same `npm run test ...` command. Expected: PASS — all 25 transition assertions + invariants.

`- [ ]` **Step 5: Verify gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/store/interaction-fsm.test.ts && npm run check -w @portfolio/museum
```
Expected: PASS on test; `svelte-check: 0 errors / 0 warnings` ideally (this task adds no `.svelte` file svelte-check should remain 0/0 — confirm).

---

### Task 2: Cursor helper + tests

**Files:**
- Create: `apps/museum/src/lib/editor/interaction-cursor.ts`
- Create: `apps/museum/src/lib/editor/interaction-cursor.test.ts`

**Interfaces:**
- Consumes: `FSMState`, `PlacementId | null`.
- Produces:

```ts
export interface CursorInputs {
  state: FSMState;
  hoverTargetId: string | null;
  isDraggingCurrently: boolean;
}

export type Cursor = 'default' | 'pointer' | 'grabbing';

export function computeCursor(input: CursorInputs): Cursor;
```

`- [ ]` **Step 1: Write the failing tests**

```ts
// apps/museum/src/lib/editor/interaction-cursor.test.ts
import { describe, expect, it } from 'vitest';
import { computeCursor, type CursorInputs } from './interaction-cursor';

const base: CursorInputs = { state: 'Idle', hoverTargetId: null, isDraggingCurrently: false };

describe('computeCursor', () => {
  it('Idle + no hover → default', () => expect(computeCursor({ ...base })).toBe('default'));
  it('Idle + hover → pointer', () =>
    expect(computeCursor({ ...base, state: 'Idle', hoverTargetId: 'p1' })).toBe('pointer'));
  it('Hover + no hover → default', () =>
    expect(computeCursor({ ...base, state: 'Hover', hoverTargetId: null })).toBe('default'));
  it('Hover + hover → pointer', () =>
    expect(computeCursor({ ...base, state: 'Hover', hoverTargetId: 'p1' })).toBe('pointer'));
  it('Selected + no hover → default', () =>
    expect(computeCursor({ ...base, state: 'Selected', hoverTargetId: null })).toBe('default'));
  it('Selected + hover (unselected target) → pointer', () =>
    expect(computeCursor({ ...base, state: 'Selected', hoverTargetId: 'p2' })).toBe('pointer'));
  it('Dragging + no hover → grabbing', () =>
    expect(computeCursor({ ...base, state: 'Dragging', isDraggingCurrently: true })).toBe('grabbing'));
  it('Dragging + isDraggingCurrently true always grabbing', () =>
    expect(computeCursor({ ...base, state: 'Dragging', isDraggingCurrently: false })).toBe('default'));
});
```

`- [ ]` **Step 2: Run; confirm fails**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/interaction-cursor.test.ts
```
Expected: FAIL — module not found.

`- [ ]` **Step 3: Implement `interaction-cursor.ts`**

```ts
// apps/museum/src/lib/editor/interaction-cursor.ts
import type { FSMState, PlacementId } from './store/interaction-fsm';

export interface CursorInputs {
  state: FSMState;
  hoverTargetId: PlacementId | null;
  isDraggingCurrently: boolean;
}

export type Cursor = 'default' | 'pointer' | 'grabbing';

export function computeCursor(input: CursorInputs): Cursor {
  if (input.isDraggingCurrently) return 'grabbing';
  if (input.hoverTargetId !== null) return 'pointer';
  return 'default';
}
```

`- [ ]` **Step 4: Run; confirm passes**

Same command as Step 2. Expected PASS — 8 cursor truths.

`- [ ]` **Step 5: Verify gates**

`npm run test ... && npm run check ...`. PASS.

---

### Task 3: Editor interaction sub-store + tests

**Files:**
- Create: `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts`
- Create: `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts`

**Interfaces:**
- Consumes: `reduce(state, event)` from Task 1; `computeCursor` from Task 2.
- Produces:

```ts
import { type FSMState, type FSMEvent, type PlacementId } from './interaction-fsm';
import { type Cursor, type CursorInputs, computeCursor } from '../interaction-cursor';
import type { Vector3, Quaternion } from 'three';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoSpace = 'world' | 'local';

export interface DragSnapshot {
  placementIds: string[];
  transforms: { id: string; position: Vector3; quaternion: Quaternion; scale: Vector3 }[];
}

export class EditorInteractionStore {
  state: FSMState = $state('Idle');
  mode: GizmoMode = $state('translate');
  space: GizmoSpace = $state('world');
  hoverTargetId: PlacementId | null = $state(null);
  dragSnapshot: DragSnapshot | null = $state(null);
  cursor: Cursor = $state('default');
  selectionSize: number = $state(0);

  dispatch(event: FSMEvent): void;
  setMode(mode: GizmoMode): void;
  toggleSpace(): void;
  setHoverTarget(id: PlacementId | null): void;
  recomputeCursor(isDragging: boolean): void;
  captureDragSnapshot(snapshot: DragSnapshot): void;
  restoreDragSnapshot(): void;
  clearDragSnapshot(): void;
  setSelectionSize(n: number): void;
}
```

`- [ ]` **Step 1: Write the failing tests**

```ts
// apps/museum/src/lib/editor/store/editor-interaction-store.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { getContext, setContext } from 'svelte';
import { EditorInteractionStore } from './editor-interaction-store.svelte';

beforeEach(() => {
  // Fresh sub-store per test via context key.
  setContext('EditorInteractionStore', new EditorInteractionStore());
});

function instance(): EditorInteractionStore {
  return getContext<EditorInteractionStore>('EditorInteractionStore');
}

describe('EditorInteractionStore', () => {
  it('starts in Idle', () => expect(instance().state).toBe('Idle'));
  it('setMode("rotate") → mode=rotate', () => {
    instance().setMode('rotate');
    expect(instance().mode).toBe('rotate');
  });
  it('toggleSpace world→local→world', () => {
    instance().toggleSpace();
    expect(instance().space).toBe('local');
    instance().toggleSpace();
    expect(instance().space).toBe('world');
  });
  it('dispatch POINTER_MOVE target=null → cursor default', () => {
    instance().dispatch({ type: 'POINTER_MOVE', target: null });
    expect(instance().cursor).toBe('default');
  });
  it('dispatch POINTER_MOVE target="p1" → cursor pointer', () => {
    instance().dispatch({ type: 'POINTER_MOVE', target: 'p1' });
    expect(instance().cursor).toBe('pointer');
  });
  it('captureDragSnapshot then restoreDragSnapshot round-trip', () => {
    const snap = {
      placementIds: ['p1'],
      transforms: [{ id: 'p1', position: new Vector3(1, 2, 3), quaternion: new Quaternion(), scale: new Vector3(1, 1, 1) }]
    };
    instance().captureDragSnapshot(snap);
    expect(instance().dragSnapshot).toEqual(snap);
    instance().restoreDragSnapshot();
    expect(instance().dragSnapshot).toEqual(snap); // cleared after restore.
  });
  it('selectionSize setter', () => {
    instance().setSelectionSize(3);
    expect(instance().selectionSize).toBe(3);
  });
  it('recomputeCursor respects dragging flag', () => {
    instance().recomputeCursor(true);
    expect(instance().cursor).toBe('grabbing');
  });
});
```

`- [ ]` **Step 2: Run; confirm fails**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/store/editor-interaction-store.test.ts
```
Expected: FAIL — `Cannot find module`.

`- [ ]` **Step 3: Implement `editor-interaction-store.svelte.ts`**

```ts
// apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts
import type { FSMState, FSMEvent, PlacementId } from './interaction-fsm';
import { CommitDragSideEffect, RevertDragSideEffect, reduce } from './interaction-fsm';
import { type Cursor, type CursorInputs, computeCursor } from '../interaction-cursor';
import type { Vector3, Quaternion } from 'three';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoSpace = 'world' | 'local';

export interface DragSnapshot {
  placementIds: string[];
  transforms: { id: string; position: Vector3; quaternion: Quaternion; scale: Vector3 }[];
}

export class EditorInteractionStore {
  state: FSMState = $state('Idle');
  mode: GizmoMode = $state('translate');
  space: GizmoSpace = $state('world');
  hoverTargetId: PlacementId | null = $state(null);
  dragSnapshot: DragSnapshot | null = $state(null);
  cursor: Cursor = $state('default');
  selectionSize: number = $state(0);
  private isDraggingCurrently: boolean = false;

  dispatch(event: FSMEvent): void {
    const { state, effects } = reduce(this.state, event);
    this.state = state;
    for (const effect of effects) {
      if (effect instanceof CommitDragSideEffect) this.isDraggingCurrently = false;
      if (effect instanceof RevertDragSideEffect) this.isDraggingCurrently = false;
    }
    this.recomputeCursor(this.isDraggingCurrently);
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode;
  }

  toggleSpace(): void {
    this.space = this.space === 'world' ? 'local' : 'world';
  }

  setHoverTarget(id: PlacementId | null): void {
    this.hoverTargetId = id;
    this.recomputeCursor(this.isDraggingCurrently);
  }

  recomputeCursor(dragging: boolean): void {
    this.isDraggingCurrently = dragging;
    const input: CursorInputs = {
      state: this.state,
      hoverTargetId: this.hoverTargetId,
      isDraggingCurrently: dragging
    };
    this.cursor = computeCursor(input);
  }

  captureDragSnapshot(snapshot: DragSnapshot): void {
    this.dragSnapshot = snapshot;
  }

  restoreDragSnapshot(): void {
    this.dragSnapshot = null;
  }

  clearDragSnapshot(): void {
    this.dragSnapshot = null;
  }

  setSelectionSize(n: number): void {
    this.selectionSize = n;
  }
}

export const EDITOR_INTERACTION_STORE_KEY = Symbol('EditorInteractionStore');
```

`- [ ]` **Step 4: Run; confirm passes**

Same command as Step 2. Expected: PASS — 8 sub-store assertions.

`- [ ]` **Step 5: Verify gates**

`npm run test ... && npm run check ...`. PASS.

**Note for implementer:** The Sub-store is svelte-context injectable. Task 7 wires it into `MuseumEditorApp.svelte` via `setContext(EDITOR_INTERACTION_STORE_KEY, this.interactionStore)`. Until Task 7 completes, tests use `setContext`/`getContext` directly under a runtime-agnostic Svelte 5 root instance. Confirm the test harness compatible with vitest's Svelte 5 mode — if not, refactor tests to construct via `new EditorInteractionStore()` directly without context, and access members as ordinary fields. The important contract is the public methods and reactive properties.

---

### Task 4: Snap setter additions + defaults in `session-state.svelte.ts`

**Files:**
- Modify: `apps/museum/src/lib/editor/store/session-state.svelte.ts`
- Modify: `apps/museum/src/lib/editor/store/session-state.test.ts`

**Interfaces:**
- Consumes: existing `EditorSessionState` setters for translate + rotate.
- Produces:

```ts
// Setter pattern matching existing translate/rotate setters.
scaleSnapEnabled = $state(false);
scaleSnap = $state(DEFAULT_SCALE_SNAP);          // 0.1

setScaleSnapEnabled(value: boolean): void;
toggleScaleSnap(): void;
setScaleSnap(value: number): void;

// Default values:
DEFAULT_SCALE_SNAP = 0.1;

// Translate/rotate defaults flipped from `true` → `false`
// in the constructor (or initial-state block) — keep rotate default degree at 15°.
```

`- [ ]` **Step 1: Read existing `session-state.svelte.ts` snap block**

Locate `translationSnapEnabled = $state(true);` and `setRotationSnapDegrees`. Note existing constant definitions and the constructor / `$state` initialiser block.

`- [ ]` **Step 2: Write the failing tests in `session-state.test.ts`**

```ts
// In existing describe('snap + keep-on-floor', () => { ... })
it('snap defaults are off on first load', () => {
  const session = new EditorSessionState();
  expect(session.translationSnapEnabled).toBe(false);
  expect(session.rotationSnapEnabled).toBe(false);
  expect(session.scaleSnapEnabled).toBe(false);
  expect(session.scaleSnap).toBe(0.1);
  expect(session.translationSnap).toBe(0.25);
  expect(session.rotationSnapDegrees).toBe(15);
});

it('setScaleSnap / setScaleSnapEnabled write absolute values', () => {
  const session = new EditorSessionState();
  session.setScaleSnapEnabled(true);
  session.setScaleSnap(0.05);
  expect(session.scaleSnapEnabled).toBe(true);
  expect(session.scaleSnap).toBe(0.05);
  session.toggleScaleSnap();
  expect(session.scaleSnapEnabled).toBe(false);
});
```

`- [ ]` **Step 3: Run; confirm fails**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/store/session-state.test.ts
```
Expected: FAIL — scaleSnap setter / new defaults not present.

`- [ ]` **Step 4: Modify `session-state.svelte.ts`**

Add (near the existing snap block, around line 230–270 in the current file):

```ts
const DEFAULT_SCALE_SNAP = 0.1;
scaleSnapEnabled = $state(false);
scaleSnap = $state(DEFAULT_SCALE_SNAP);

setScaleSnapEnabled(value: boolean) {
  this.scaleSnapEnabled = value;
}

toggleScaleSnap() {
  this.scaleSnapEnabled = !this.scaleSnapEnabled;
}

setScaleSnap(value: number) {
  this.scaleSnap = value;
}
```

Also change the existing two initial-state lines:

```ts
translationSnapEnabled = $state(true);
rotationSnapEnabled = $state(true);
```

to:

```ts
translationSnapEnabled = $state(false);
rotationSnapEnabled = $state(false);
```

And change the rotation default degree constant from 45° to 15° (currently `DEFAULT_ROTATION_SNAP_DEGREES`). If the constant import is shared with other call sites, redefine a new local `DEFAULT_ROTATION_SNAP_DEGREES = 15` at this file's top instead — confirm the implementer does not break unrelated callers.

`- [ ]` **Step 5: Run; confirm passes**

Same command. Expected PASS.

`- [ ]` **Step 6: Verify gates**

`npm run test ... && npm run check ...`. PASS.

---

### Task 5: Selection AABB-sync + hover helper + visitor gate in `EditorSelectionHelper.svelte`

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelectionHelper.svelte`
- Create: `apps/museum/src/lib/editor/EditorSelectionHelper.test.ts`

**Interfaces:**
- Consumes: `store.getPlacementRoots()`, `store.isVisitorPreview`, `interactionStore.hoverTargetId` (Task 3), `interactionStore.state` (Task 3).
- Produces: gold selection helpers (one per selected placement root) + a single dim-white hover helper when `hoverTargetId` is non-null. Helpers hidden during visitor preview.

`- [ ]` **Step 1: Add the test stubs**

```ts
// apps/museum/src/lib/editor/EditorSelectionHelper.test.ts
import { describe, expect, it } from 'vitest';
import { Box3, Box3Helper, Object3D, Mesh, BoxGeometry } from 'three';

function makeRoot() {
  const m = new Mesh(new BoxGeometry(2, 1, 1));
  const root = new Object3D();
  root.add(m);
  return { root, mesh: m };
}

describe('EditorSelectionHelper — AABB sync', () => {
  it('Box3.setFromObject produces expected world-space bounds', () => {
    const { root } = makeRoot();
    root.position.set(5, 0, 0);
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root);
    expect(box.min.x).toBeCloseTo(4);
    expect(box.max.x).toBeCloseTo(6);
  });

  it('Box3Helper reads its .box field directly', () => {
    const helper = new Box3Helper(new Box3(), 0xd6b35f);
    expect(helper.box.min.x).toBe(-Infinity);
    helper.box.setFromArray([0, 0, 0, 1, 1, 1]);
    expect(helper.box.min.x).toBe(0);
    expect(helper.box.max.x).toBe(1);
  });
});
```

`- [ ]` **Step 2: Run; confirm passes against `three`**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor/EditorSelectionHelper.test.ts
```
Expected: PASS (this task's tests are about Three itself, not the Svelte component yet).

`- [ ]` **Step 3: Replace `EditorSelectionHelper.svelte` body**

Replace the existing `<script lang="ts">…</script>` block with:

```svelte
<script lang="ts">
  import { Box3, Box3Helper, type Material } from 'three';
  import { useTask, useThrelte } from '@threlte/core';
  import type { MuseumEditorStore } from './museum-editor.svelte';
  import { getContext } from 'svelte';
  import {
    EDITOR_INTERACTION_STORE_KEY,
    type EditorInteractionStore
  } from './store/editor-interaction-store.svelte';

  let { store }: { store: MuseumEditorStore } = $props();
  const { scene } = useThrelte();
  const interactionStore = getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY);

  type HelperRecord = {
    root: Object3D;
    box: Box3;
    helper: Box3Helper;
  };
  let helpers: HelperRecord[] = [];
  let hoverHelper: Box3Helper | null = null;
  let hoverBox: Box3 | null = null;
  let hoverRoot: Object3D | null = null;

  function disposeHelperRecord(record: HelperRecord) {
    record.helper.removeFromParent();
    const material = record.helper.material as Material | Material[];
    if (Array.isArray(material)) for (const entry of material) entry.dispose();
    else material.dispose();
    record.box.makeEmpty();
  }

  function disposeHoverHelper() {
    if (!hoverHelper) return;
    hoverHelper.removeFromParent();
    const material = hoverHelper.material as Material | Material[];
    if (Array.isArray(material)) for (const entry of material) entry.dispose();
    else material.dispose();
    hoverHelper = null;
    hoverBox = null;
    hoverRoot = null;
  }

  $effect(() => {
    void store.selectionKey;
    const roots = store.getPlacementRoots();
    const next: HelperRecord[] = roots.map((root) => {
      const box = new Box3();
      const helper = new Box3Helper(box, 0xd6b35f);
      helper.raycast = () => null;
      helper.renderOrder = 1000;
      const material = helper.material as Material & { depthTest?: boolean };
      material.depthTest = false;
      helper.frustumCulled = false;
      scene.add(helper);
      return { root, box, helper };
    });
    helpers = next;
    interactionStore.setSelectionSize(next.length);
    return () => {
      for (const record of next) disposeHelperRecord(record);
      if (helpers === next) helpers = [];
    };
  });

  $effect(() => {
    void store.isVisitorPreview;
    if (store.isVisitorPreview) {
      for (const record of helpers) record.helper.visible = false;
      disposeHoverHelper();
      return;
    }
    for (const record of helpers) record.helper.visible = true;
    // recreate hover helper if visitor entering then exiting
    return () => undefined;
  });

  $effect(() => {
    const id = interactionStore.hoverTargetId;
    if (store.isVisitorPreview) {
      disposeHoverHelper();
      return;
    }
    const root = id ? store.getPlacementRoot(id) ?? null : null;
    if (!root) {
      disposeHoverHelper();
      return undefined;
    }
    if (hoverRoot === root && hoverHelper) return;
    disposeHoverHelper();
    hoverBox = new Box3();
    hoverHelper = new Box3Helper(hoverBox, 0xffffff);
    hoverRoot = root;
    hoverHelper.raycast = () => null;
    hoverHelper.renderOrder = 999;
    const material = hoverHelper.material as Material & { depthTest?: boolean; transparent?: boolean; opacity?: number };
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.35;
    hoverHelper.frustumCulled = false;
    scene.add(hoverHelper);
    return () => disposeHoverHelper();
  });

  useTask(() => {
    for (const { root, box, helper } of helpers) {
      box.makeEmpty();
      box.setFromObject(root);
      helper.visible = !box.isEmpty();
    }
    if (hoverHelper && hoverBox && hoverRoot) {
      hoverBox.makeEmpty();
      hoverBox.setFromObject(hoverRoot);
      hoverHelper.visible = !hoverBox.isEmpty();
    }
  });
</script>
```

`- [ ]` **Step 4: Verify `svelte-check` clean + existing tests still pass**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor && npm run check -w @portfolio/museum
```
Expected: editor tests stay green; `svelte-check` returns 0 / 0.

`- [ ]` **Step 5: Add a focused component test**

Append to `EditorSelectionHelper.test.ts`:

```ts
describe('EditorSelectionHelper — properties', () => {
  it('selection helper uses 0xd6b35f gold + no raycast', () => {
    const box = new Box3();
    const helper = new Box3Helper(box, 0xd6b35f);
    helper.raycast = () => null;
    helper.renderOrder = 1000;
    expect(helper.raycast).toBeTypeOf('function');
    expect(helper.renderOrder).toBe(1000);
  });
});
```

Re-run. PASS.

`- [ ]` **Step 6: Verify gates**

`npm run test ... && npm run check ...`. PASS with the new test added.

---

### Task 6: Gizmo defaults + Space per-mode + FSM hook + Ctrl/Cmd snap + Esc revert in `EditorTransformControls.svelte`

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformControls.svelte`

**Interfaces:**
- Consumes: `interactionStore.mode`, `interactionStore.space`, `interactionStore.dragSnapshot`, `interactionStore.dispatch`, `interactionStore.cursor` (Task 3); `sessionState.translationSnapEnabled`, `sessionState.setTranslationSnap`, `sessionState.setRotationSnap`, `sessionState.setScaleSnap` (Task 4); `transformControls.dragging-changed`, `transformControls.setMode`, `transformControls.setSpace`, `transformControls.setTranslationSnap`.
- Produces: gizmo default `translate` on every new selection-set; per-mode Space (Translate/Scale→world, Rotate→local, multi-select→world); keydown W/E/R/T/X; keydown Ctrl/Cmd enables snap; keydown Esc mid-drag reverts + deselects.

`- [ ]` **Step 1: Read the existing `EditorTransformControls.svelte`**

The existing file already attaches TransformControls to a synthetic pivot, listens for `mouseDown` / `objectChange` / `mouseUp`, and integrates `snapPivotRoomLocal`. Read functions:

- `beginTransform` (line ~230)
- `previewTransform` (line ~250)
- `finishTransform` (search for `function finishTransform`)
- the onKeyDown handler that flips `shiftHeld` (search `function onKeyDown`)
- the `$effect` block that runs once to set up listeners

Add the interaction store context read at the top of `<script>`:

```ts
import { getContext } from 'svelte';
import {
  EDITOR_INTERACTION_STORE_KEY,
  type EditorInteractionStore,
  type DragSnapshot
} from './store/editor-interaction-store.svelte';
const interactionStore = getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY);
```

Add a context-key import; the rest of the wiring depends on existing helpers.

`- [ ]` **Step 2: Add translate-default + Space per-mode $effect**

Inside `<script>` add:

```ts
$effect(() => {
  // Re-fires on selectionKey change AND/OR selectionSize change (because we read both).
  void store.selectionKey;
  const size = store.selectedPlacementIds.length;
  interactionStore.setSelectionSize(size);
  transformControls.setMode('translate');                       // Q5: every new selection-set resets to Translate.
  if (size === 0) transformControls.detach();
  else transformControls.attach(pivot);
});

$effect(() => {
  const size = store.selectedPlacementIds.length;
  const mode = interactionStore.mode;
  if (size <= 1) {
    transformControls.setSpace(mode === 'rotate' ? 'local' : 'world');
  } else {
    transformControls.setSpace('world');
  }
});
```

`transformControls.attach(pivot)` is the existing call signature. Verify against `Three.TransformControls` API; if it requires attaching an Object3D, pass the pivot already in scope.

`- [ ]` **Step 3: Hook `dragging-changed` to FSM**

Add a new listener:

```ts
transformControls.addEventListener('dragging-changed', (event: { value: boolean }) => {
  if (event.value === true) {
    interactionStore.dispatch({ type: 'DRAG_START' });
    const snapshot: DragSnapshot = {
      placementIds: [...store.selectedPlacementIds],
      transforms: store.selectedPlacementIds.map((id) => {
        const root = store.getPlacementRoot(id);
        if (!root) throw new Error(`placement root missing for ${id}`);
        return {
          id,
          position: root.position.clone(),
          quaternion: root.quaternion.clone(),
          scale: root.scale.clone()
        };
      })
    };
    interactionStore.captureDragSnapshot(snapshot);
    interactionStore.recomputeCursor(true);
  } else {
    interactionStore.dispatch({ type: 'DRAG_END', cancelled: false });
    interactionStore.clearDragSnapshot();
    interactionStore.recomputeCursor(false);
  }
});
```

Verify `transformControls.dragging-changed` payload shape against `three/examples/jsm/controls/TransformControls.js`. The shipped API uses `{ value: boolean }`.

`- [ ]` **Step 4: Add Esc handler for mid-drag revert**

Augment the existing `onKeyDown` listener:

```ts
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && transformControls.dragging === true) {
    event.preventDefault();
    event.stopPropagation();
    const snap = interactionStore.dragSnapshot;
    if (snap) {
      for (const t of snap.transforms) {
        const root = store.getPlacementRoot(t.id);
        if (!root) continue;
        root.position.copy(t.position);
        root.quaternion.copy(t.quaternion);
        root.scale.copy(t.scale);
      }
    }
    transformControls.dragging = false;
    transformControls.dispatchEvent({ type: 'dragging-changed', value: false });
    interactionStore.clearDragSnapshot();
    interactionStore.dispatch({ type: 'ESC' });
    store.selectionActions.deselect();
    return;
  }
  if (event.key === 'Escape' && !transformControls.dragging) {
    // already wired in hooks/shortcuts.svelte.ts sceneOwnsShortcuts branch — leave alone.
    return;
  }
  // ...existing Shift / End / etc. handling stays.
}
```

The Esc mid-drag path mutates the placement root positions directly; this is a reverting write, not a document mutation, so no `beginDocument`/`cancel` is needed. The downstream `dragSnapshot` is cleared, the FSM returns to Idle via the synthetic `dragging-changed` event, and `selectionActions.deselect()` clears selection.

`- [ ]` **Step 5: Add Ctrl/Cmd modifier listeners for snap**

Add (just below `onKeyDown` definition):

```ts
function onSnapModifierChange() {
  const on = window.event; // unused; rely on event below
}
window.addEventListener('keydown', (event) => {
  if (!transformControls.dragging) return;
  if (!event.ctrlKey && !event.metaKey) return;
  transformControls.setTranslationSnap(store.translationSnap);
  const radians = (store.rotationSnapDegrees * Math.PI) / 180;
  transformControls.setRotationSnap(radians);
  transformControls.setScaleSnap(store.scaleSnap);
});
window.addEventListener('keyup', (event) => {
  if (!transformControls.dragging) return;
  if (event.ctrlKey || event.metaKey) return;
  transformControls.setTranslationSnap(0);
  transformControls.setRotationSnap(0);
  transformControls.setScaleSnap(0);
});
```

**Note for implementer:** Verify the snap-step semantics against `three/examples/jsm/controls/TransformControls.js`. The library's `setScaleSnap(N)` rounds the uniform scale factor to N. Set via `(1 - smallN, 1 + smallN)` if necessary. If unclear, drop in `setScaleSnap(0)` only — the scale path is rarely used and may stay disabled day-one. Acceptable.

`- [ ]` **Step 6: Verify gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor && npm run check -w @portfolio/museum
```
Expected: PASS. Existing tests stay green.

`- [ ]` **Step 7: Manual smoke visit `/dev/museum-editor`**

Open `http://localhost:5174/dev/museum-editor` (the dev server is running), confirm:
- Click on a Paris table — gizmo appears in translate mode.
- Press R — gizmo mode flips to rotate.
- Press X — gizmo space flips to local/world.
- Click + drag the gizmo — placement moves; release commits one history entry (Undoes back to original).
- Press Esc mid-drag — placement snaps back, selection clears.
- Hold Ctrl while dragging — placement snaps to 0.25 m grid.

If any of these regress, **stop and revisit Task 6** before moving on.

---

### Task 7: Modifier dispatch + drag-suppress gate + `hoverTargetId` publication in `EditorSelection.svelte`

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelection.svelte`

**Interfaces:**
- Consumes: existing `onPointerUp`, `applySelectionFromPointer` (line ~717), `updateHover` (line ~581), `store.selectionActions`, `store.transformControls` (passed in via prop), `interactionStore.setHoverTarget`, `interactionStore.hoverTargetId`.
- Produces: Shift modifier adds; Ctrl/Cmd modifier toggles; empty-click deselects; `hoverTargetId` from `updateHover` published to `interactionStore`.

`- [ ]` **Step 1: Read `updateHover` and `applySelectionFromPointer`**

Locate and inspect both functions. They already exist. The new step only adds:
1. After `updateHover` resolves the target placement, push it to `interactionStore.setHoverTarget(...)`.
2. After `applySelectionFromPointer` finishes, push `null` to clear the hover target while selected.
3. Confirm `onPointerUp`'s `transformControls?.dragging` guard suffices — no new code needed for drag-suppress.

`- [ ]` **Step 2: Wire hover publication**

Inside `updateHover`, find the call site where the hover-target placement is detected (likely `hoverTargetPlacementId` or similar). Wrap it:

```ts
import { getContext } from 'svelte';
import { EDITOR_INTERACTION_STORE_KEY, type EditorInteractionStore } from './store/editor-interaction-store.svelte';

const interactionStore = getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY);

// at the end of updateHover, after the existing hover-state mutations:
interactionStore.setHoverTarget(hoverHit?.id ?? null);
```

Use the actual variable name from the file. If `hoverHit.id` differs, use whatever the existing identifier is.

`- [ ]` **Step 3: Modifier dispatch in `applySelectionFromPointer`**

Inspect the existing selection-routing inside `applySelectionFromPointer`. It already calls `selectionActions.selectOnly` / `selectAllInRoom` / etc. Add:

```ts
function applySelectionFromPointer(event: PointerEvent) {
  const target = hoverHit; // whatever the existing identifier is.
  if (target == null) {
    store.selectionActions.deselect();
    interactionStore.dispatch({ type: 'CLICK', target: null, shift: false, meta: false });
    return;
  }
  const shift = event.shiftKey;
  const meta = event.metaKey || event.ctrlKey;
  if (shift) store.selectionActions.addToSelection(target.id);
  else if (meta) store.selectionActions.toggleInSelection(target.id);
  else store.selectionActions.selectOnly(target.id);
  interactionStore.dispatch({ type: 'CLICK', target: target.id, shift, meta });
}
```

Confirm the existing `selectionActions` exposes `selectOnly`, `addToSelection`, `toggleInSelection`. If a different API surface exists, bridge through wrapper functions in `museum-editor.svelte.ts`. Confirm by reading `selection-actions.svelte.ts`.

`- [ ]` **Step 4: Verify gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor && npm run check -w @portfolio/museum
```
Expected: PASS.

`- [ ]` **Step 5: Manual smoke visit `/dev/museum-editor`**

Confirm:
- Click empty area (sky/empty) — selection clears; cursor → default.
- Click a placement — selection lights up; cursor → default.
- Shift+click another — both selected.
- Ctrl+click — toggles.

---

### Task 8: DOM cursor binding in `EditorViewport.svelte`

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorViewport.svelte`

**Interfaces:**
- Consumes: `interactionStore.cursor` (Task 3), `interactionStore.state` (Task 3) — derived reactivity.
- Produces: `style.cursor` on the canvas container bound to `interactionStore.cursor`.

`- [ ]` **Step 1: Locate the canvas container binding**

Find the `<div class="viewport-canvas…">` in the file and the Svelte binding. Append a class-based or `style: cursor={...}` binding.

`- [ ]` **Step 2: Bind cursor**

Add at the top of `<script>`:

```ts
import { getContext } from 'svelte';
import { EDITOR_INTERACTION_STORE_KEY, type EditorInteractionStore } from './store/editor-interaction-store.svelte';
const interactionStore = getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY);
```

Modify the canvas wrapper to:

```svelte
<div class="viewport-canvas" style:cursor={interactionStore.cursor}>
  <!-- existing Threlte canvas markup -->
</div>
```

`- [ ]` **Step 3: Verify gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run apps/museum/src/lib/editor && npm run check -w @portfolio/museum
```
Expected: PASS.

`- [ ]` **Step 4: Manual smoke visit `/dev/museum-editor`**

Confirm:
- Idle → arrow cursor.
- Hover placement → pointer/hand cursor.
- Drag gizmo → grabbing cursor.
- Release → default or pointer.
- Visitor preview → no cursor changes (existing behaviour).

---

### Task 9: Shortcuts (W/E/R/T/X/Esc) + Toolbar UI text + wire context key + handoff doc + visitor chunk grep

**Files:**
- Modify: `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts`
- Modify: `apps/museum/src/lib/editor/EditorViewportToolbar.svelte`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte` (already has `outlinerElement` setup; add the context key wiring)
- Create: `docs/agent-handoffs/phase-6.1.md`

**Interfaces:**
- Consumes: existing `createEditorShortcutHandler`; `interactionStore.setMode`, `interactionStore.toggleSpace`, `interactionStore.dispatch`.
- Produces: W/E/R/T/X handlers gizmo mode; Esc mid-drag interaction already wired in Task 6 — the `Esc` branch in `hooks/shortcuts.svelte.ts` only fires on idle (not during drag) so leave the existing idle-Esc deselect path untouched.

`- [ ]` **Step 1: Add W/E/R/T/X handlers to `createEditorShortcutHandler`**

Inside the returned `(event: KeyboardEvent) => { ... }`, after the `isEditableTarget(event.target)` early return, but BEFORE the `if (modifier && key === 'z') …` block, add:

```ts
if (!modifier && !event.altKey && !event.shiftKey) {
  if (key === 'w') {
    interactionStore.setMode('translate');
    event.preventDefault();
    return;
  }
  if (key === 'e') {
    interactionStore.setMode('rotate');
    event.preventDefault();
    return;
  }
  if (key === 'r') {
    interactionStore.setMode('scale');
    event.preventDefault();
    return;
  }
  if (key === 't') {
    interactionStore.setMode('translate');
    event.preventDefault();
    return;
  }
  if (key === 'x') {
    interactionStore.toggleSpace();
    event.preventDefault();
    return;
  }
}
```

Add `interactionStore` to the `createEditorShortcutHandler` signature:

```ts
export function createEditorShortcutHandler(
  store: MuseumEditorStore,
  host: EditorShortcutHost,
  interactionStore: EditorInteractionStore
) { ... }
```

And update `registerEditorShortcuts` as well. Find every call site of these two functions; in Phase 5.x they are likely called from `MuseumEditorApp.svelte`.

`- [ ]` **Step 2: Update `EditorViewportToolbar.svelte` snap-hint text**

Locate the line "Hold Shift while dragging to bypass snapping" (around line 130 — exact line may differ after Phase 5.5 polish). Replace with:

```svelte
<button …>Hold Ctrl/Cmd while dragging to snap</button>
```

Also find the existing mode indicator chip; bind it to `interactionStore.mode`:

```svelte
<span class="mode-chip" data-mode={interactionStore.mode}>
  {interactionStore.mode === 'translate' ? '↔' : interactionStore.mode === 'rotate' ? '↻' : '⇲'}
  {interactionStore.mode}
</span>
```

`- [ ]` **Step 3: Wire the interaction-store context in `MuseumEditorApp.svelte`**

The `MuseumEditorApp.svelte` already constructs and exposes the store via bindings (e.g., `outlinerElement`, `viewportElement`). Find the `$effect` block (line ~73) that exposes store properties. Add:

```ts
import {
  EDITOR_INTERACTION_STORE_KEY,
  EditorInteractionStore
} from './store/editor-interaction-store.svelte';

const interactionStore = new EditorInteractionStore();
setContext(EDITOR_INTERACTION_STORE_KEY, interactionStore);
```

This single context set is what every later component reads from. Verify EditorViewport, EditorSelection, EditorSelectionHelper, EditorTransformControls all consume `getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY)` consistently.

`- [ ]` **Step 4: Verify gates**

```bash
cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run && npm run check -w @portfolio/museum && npm run build -w @portfolio/museum
```
Expected:
- `Test Files 57+ passed (...)` / `791+ passed`
- `svelte-check: 0 errors / 0 warnings`
- Build exit 0

`- [ ]` **Step 5: Manual walkthrough — full 10-step cookbook**

Run the manual walkthrough captured in the design doc §5. Every item must pass.

`- [ ]` **Step 6: Visitor chunk grep**

```bash
cd /Users/tony/Documents/Personal && grep -rE 'museum-editor|interactionStore|Box3Helper|interaction-fsm' apps/museum/.svelte-kit/output/client/_app/immutable/nodes/ 2>/dev/null | head -30
```

Inspect any matches. They MUST NOT appear in the visitor-only chunk graph. Run with `npm run build` and inspect `/museum` route output.

Acceptable: zero matches against visitor chunks. If a chunk appears, identify the editor-only path that bled into the visitor and gate it via the existing `museum-editor-entry-plugin.ts`.

`- [ ]` **Step 7: Write the handoff doc**

Create `docs/agent-handoffs/phase-6.1.md` mirroring the Phase 5.4 handoff structure:

| Section | Contents |
|---|---|
| Goal | Phrase the Phase 6.1 outcome in two sentences. |
| What shipped | List each task card, what landed, where in tree. |
| Verification evidence | Test count delta, `svelte-check`, build, manual cookbook results, visitor chunk grep result. |
| Plan deviations | Three immediate fixes → §1, §2, §3, §6; known limitations → here. |
| Known limitations carried | OBB rotation reshape; snap settings UI; multi-select Active Object; marquee; `controls.dragging` private-flag workaround. |
| Next slice pointer | Phase 6.2 — settings UI + Active Object pivot. |

Confirm to user that handoff doc is filed; update CURRENT.md and README pointers to "Phase 6.1 shipped" before declaring this task complete.

`- [ ]` **Step 8: Final review and report**

Spawn `superpowers:code-reviewer` (or equivalent `code_reviewer_minimax_m3`) against the diff. Address 🟡 findings inline and confirm all ⓘ items are acceptable or scheduled for follow-up.

---

## Out of scope (deferred to 6.2 / 6.3)

- OBB outline (proper rotation with object).
- Snap settings UI panel (configurable default + step).
- Multi-select pivot "Active Object" mode.
- Pivot "Individual Origins" rotation for multi-select.
- Marquee / box-select.
- Pressure / touch / pen input.
- Networked sync, account persistence, filesystem Save.

## Acceptance criteria

Phase 6.1 ships when:

1. All vitest gates green; `npx svelte-check --output machine` 0/0; `npm run build -w @portfolio/museum` exit 0.
2. New test count delta = +53 (FSM 25 + cursor 8 + sub-store 8 + snap 2 + helper 10 = 53).
3. Manual walkthrough (10 items in design §5) green.
4. Visitor chunk graph: zero editor modules; zero `/local/...` URIs.
5. Editor `/dev/museum-editor` boots clean; selection + gizmo + snap + keybinds + undo/redo interact correctly.
6. `docs/agent-handoffs/phase-6.1.md` written + committed at slice close.
