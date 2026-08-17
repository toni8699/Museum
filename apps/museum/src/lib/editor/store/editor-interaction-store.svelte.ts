/**
 * Phase 6.1 — reactive sub-store for the editor interaction state machine.
 *
 * Wraps the pure `reduce()` from `interaction-fsm.ts` with Svelte 5 `$state`
 * runes so any Svelte component reading these props will re-render on change.
 *
 * The store is the single source of truth for everything UI flows read about
 * the editor's current selection / hover / gizmo state. Components subscribe
 * to the reactive fields via Svelte's normal reactivity, and write back via
 * `dispatch()` (FSM events) or the typed methods (`setMode`, `toggleSpace`,
 * etc.).
 *
 * The store is set on Svelte context under `EDITOR_INTERACTION_STORE_KEY` in
 * `MuseumEditorApp.svelte` (Task 9) and read via `getContext()` from
 * `EditorSelectionHelper`, `EditorTransformControls`, `EditorSelection`,
 * `EditorViewport`, and `hooks/shortcuts`.
 */

import type { FSMState, FSMEvent, PlacementId } from './interaction-fsm';
import { CommitDragSideEffect, RevertDragSideEffect, reduce } from './interaction-fsm';
import { type Cursor, type CursorInputs, computeCursor } from '../interaction-cursor';
import type { ScaleMode } from '../scale-vector';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GizmoSpace = 'world' | 'local';

export class EditorInteractionStore {
	state: FSMState = $state('Idle');
	mode: GizmoMode = $state('translate');
	space: GizmoSpace = $state('world');
	hoverTargetId: PlacementId | null = $state(null);
	cursor: Cursor = $state('default');
	selectionSize: number = $state(0);
	// Phase 1a — placement-relative scale mode toggle. Default 'uniform'
	// preserves today's single-axis gizmo behaviour. Independent mode keeps
	// gizmo writes per-axis without enforcing all-equal scale.
	scaleMode: ScaleMode = $state('uniform');
	private isDraggingCurrently: boolean = false;

	/**
	 * Reduce `(state, event)` through the pure FSM and apply any side effects.
	 * Currently the side effects are marker-only (sub-store doesn't apply them
	 * internally); the listeners in `EditorTransformControls` and `EditorSelection`
	 * restore / commit.
	 *
	 * H1 S7 — `ACTIVE_TARGET_CHANGE { targetKey }` syncs the live attachable
	 * gizmo target: `Selected` means a target exists (key present), `Idle`
	 * means detached (`null`); the event is ignored during `Dragging`. The
	 * single host dispatches it on attach/detach; camera targets therefore
	 * enter `Dragging` through the same `DRAG_START` as placements.
	 */
	dispatch(event: FSMEvent): void {
		const { state, effects } = reduce(this.state, event);
		this.state = state;
		for (const effect of effects) {
			if (effect instanceof CommitDragSideEffect) {
				this.isDraggingCurrently = false;
			} else if (effect instanceof RevertDragSideEffect) {
				this.isDraggingCurrently = false;
			}
		}
		this.recomputeCursor(this.isDraggingCurrently);
	}

	setMode(mode: GizmoMode): void {
		this.mode = mode;
	}

	toggleScaleMode(): void {
		this.scaleMode = this.scaleMode === 'uniform' ? 'independent' : 'uniform';
	}

	setScaleMode(mode: ScaleMode): void {
		this.scaleMode = mode;
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

	setSelectionSize(n: number): void {
		this.selectionSize = n;
	}
}

export const EDITOR_INTERACTION_STORE_KEY = Symbol('EditorInteractionStore');
