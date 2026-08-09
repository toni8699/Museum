# Phase 6.1 — Gizmo + Selection Interaction Parity

**Date:** 2026-08-08
**Status:** Shipped
**Prior slice:** [`./phase-5.4.md`](./phase-5.4.md) (Phase 5.4 — binary upload + package export)
**Carry-over design:** [`../superpowers/specs/2026-08-08-phase-6-1-gizmo-parity-design.md`](../superpowers/specs/2026-08-08-phase-6-1-gizmo-parity-design.md)
**Implementation plan:** [`../superpowers/plans/2026-08-08-phase-6-1-gizmo-parity.md`](../superpowers/plans/2026-08-08-phase-6-1-gizmo-parity.md)

## Goal

Bring the museum editor's select / move / rotate / scale interaction up to the standard that anyone who has touched Unity, Unreal, or Blender already knows. Phase 6.1 ships the **interaction core** — a 4-state FSM (Idle / Hover / Selected / Dragging), per-frame `Box3Helper`-synced selection outline, dim-white half-opacity hover outline, click rules (Shift add / Ctrl toggle / empty deselect / Esc revert-and-deselect), Translate default on each new selection, per-mode Space (Translate/Scale → World, Rotate → Local single-select), snap-via-Ctrl/Cmd-modifier, and a single-undo-entry-per-drag.

## What shipped

| Card | Outcome | Tree |
|---|---|---|
| 6.1.1 — Pure FSM reducer | `interaction-fsm.ts` + `interaction-fsm.test.ts`; matrix-driven 32 tests (transitions + invariants). Released FSMSnapshot of side effects for callers to apply. | `apps/museum/src/lib/editor/store/` |
| 6.1.2 — Cursor helper | `interaction-cursor.ts` + `interaction-cursor.test.ts`; 9 truth-table tests. Pure mapper, no DOM access. | `apps/museum/src/lib/editor/` |
| 6.1.3 — Editor interaction sub-store | `editor-interaction-store.svelte.ts` + `editor-interaction-store.test.ts`; 18 tests. Svelte 5 reactive wrapper around the FSM. | `apps/museum/src/lib/editor/store/` |
| 6.1.4 — Snap setters + defaults | `session-state.svelte.ts` flipped translate/rotate/scale default-off; new `setScaleSnap`/`setScaleSnapEnabled`/`toggleScaleSnap`. Facade `museum-editor.svelte.ts` exposes `scaleSnap`/`scaleSnapEnabled`. | `apps/museum/src/lib/editor/store/` |
| 6.1.5 — `EditorSelectionHelper` AABB-sync + hover helper | Replaced `BoxHelper` with `Box3Helper(box)`; per-frame `setFromObject` + auto-reference; new dim-white half-opacity hover helper bound to `interactionStore.hoverTargetId`. Visitor-preview gate extended to both helpers. | `apps/museum/src/lib/editor/EditorSelectionHelper.svelte` |
| 6.1.6 — `EditorTransformControls` defaults + FSM hook + Ctrl/Cmd snap + Esc revert | Selection-set boundary resets mode to `translate`; per-mode Space default; `dragging-changed` listener → FSM dispatch + dragSnapshot; keydown `Ctrl/Cmd` enables snap via `setTranslationSnap`/`setRotationSnap`/`setScaleSnap`; Esc handler for placement-drag revert+deselect (FSM-owned transition). | `apps/museum/src/lib/editor/EditorTransformControls.svelte` |
| 6.1.7 — `EditorSelection` modifier dispatch + hover publication | Shift+click = add (merge with current selection); Ctrl/Cmd+click = toggle; no-modifier = select-only. Empty click deselects. New `updatePlacementHover` raycasts all placement roots each pointermove and publishes the topmost hit to `interactionStore.setHoverTarget`. | `apps/museum/src/lib/editor/EditorSelection.svelte` |
| 6.1.8 — `EditorViewport` cursor binding | Outer `.viewport` div reads `interactionStore.cursor` via `style:cursor={...}`. | `apps/museum/src/lib/editor/EditorViewport.svelte` |
| 6.1.9 — Context wiring + shortcuts + toolbar UI + handoff | New `EditorInteractionStore` instantiated in `MuseumEditorApp.svelte` and `setContext`'d under `EDITOR_INTERACTION_STORE_KEY`. `createEditorShortcutHandler` accepts optional `interactionStore`; W/E/R/T/X bindings live above the modifier chains. `EditorViewportToolbar.svelte` snap-hint title flipped "Hold Shift while dragging to bypass snapping" → "Hold Ctrl/Cmd while dragging to snap". | `apps/museum/src/lib/editor/MuseumEditorApp.svelte`, `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts`, `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` |

## Verification evidence

| Gate | Threshold | Result |
|---|---|---|
| Vitest | 100% pass | **861 / 861** (61 files). Δ from Phase 5.4 baseline = +70 tests across 4 new test files. |
| `svelte-check --output machine` | 0 / 0 | **1492 files, 0 errors, 0 warnings**. |
| `npm run build` | exit 0 | Built in 5.72 s. |
| Visitor chunk grep | no editor modules | Editor module strings return zero matches against `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/*.js`. `museum-editor` only present in the dev-entry chunk. |

### New test breakdown

| File | Tests | Δ |
|---|---|---|
| `interaction-fsm.test.ts` | 32 | new |
| `interaction-cursor.test.ts` | 9 | new |
| `editor-interaction-store.test.ts` | 18 | new |
| `EditorSelectionHelper.test.ts` | 9 + 2 existing | new file |
| `session-state.test.ts` | 53 | +2 (scaleSnap toggle + setter) |
| `museum-editor-placement.test.ts` | (existing) | updated defaults |
| `museum-editor-shell.test.ts` | (existing) | updated toggle |

(vs prior spec projection of +47 → actual +70; the surplus comes from invariant cases in the FSM and hover-helper property tests.)

## Plan deviations

| # | Plan call | What shipped | Reason |
|---|---|---|---|
| 1 | FSM `Dragging + ESC → Dragging + RevertDrag` | FSM `Dragging + ESC → Idle + RevertDrag` (FSM-owned transition) | Spec §2 transition table and review gate agreed: cleaner reducer semantics; caller no longer needs to synthesize a fake `DRAG_END`. Updated §4 implementation tactic to make scrollback explicit. |
| 2 | Drag-suppress guard re-implemented in `EditorSelection` | Existing `if (transformControls?.axis \|\| transformControls?.dragging) return;` already in `onPointerDown`/`onPointerUp` — verified, unchanged. | Pre-existing guard already meets section 8; no churn. |
| 3 | `scaleSnap` defaulted to `0.1` | Shipped at `0.1` (parallel with translate's 0.1 default). | Three's `setScaleSnap(N)` rounds the uniform scale factor. Day-one scale-snap behaviour uses 0.1 as a reasonable step. |
| 4 | Toolbar: just hint-title change | Hint title flipped + chip binding deferred to follow-on polish (not blocking). | Mode-chip binding depends on an `interactveStore.mode` reactive plumb; kept simple to land. |
| 5 | Hover helper inside `EditorSelection.svelte`'s pointer pipeline | Hover raycast fires inside `updateHover` (called from `onPointerMove` when no drag is active). | Match existing `updateHover` placement in the pipeline; new helper stays bound to `interactionStore.hoverTargetId`. |

## Known limitations carried into 6.2+

| Limitation | Origin | Where it lands |
|---|---|---|
| Selection AABB reshapes under rotation | Q2 / stopgap | OBB → 6.2 |
| Snap settings UI is a minimal toggle | Q3 / snap-by-mod | Settings panel → 6.2 |
| Multi-select pivot = Center only (no Active Object) | Q5 | Active Object → 6.2 |
| Marquee / box-select absent | section 8 / phase-2-flagged | 6.3 |
| `transformControls.dragging = false` is a Three private-flag workaround | Esc mid-drag revert | Falls back to detach + re-attach if a future Three release breaks this. |
| Toolbar mode-chip not bound to `interactionStore.mode` | queue cut for polish | Cosmetic; ships next if a polish pass lands. |

## Next slice pointer — Phase 6.2

Recommended next: **Phase 6.2 — Settings UI + Active Object pivot mode + OBB outline** (design doc + plan to be drafted fresh). The carries from 6.1 carry the structural decisions already. Pick this up when the project is ready for a fresh wire-up rather than a 6.5 polish pass.

## Acceptance criteria

| Item | Result |
|---|---|
| Vitest gates green; 861 / 861 | ✓ |
| svelte-check 0 / 0; 1492 files | ✓ |
| Production build exit 0 | ✓ |
| Visitor chunk graph: zero editor modules; zero `/local/...` URIs | ✓ |
| Editor `/dev/museum-editor` boots clean; selection + gizmo + snap + keybinds + undo/redo interact correctly | ✓ (verified via test pipeline; live smoke at `http://127.0.0.1:5174/dev/museum-editor`) |
| Handoff doc written + committed | ✓ (this file) |
