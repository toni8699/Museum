/**
 * Phase 6.1 — interaction FSM for the editor selection / gizmo / drag state.
 *
 * Pure reducer only — no `$state` runes, no Three imports, no DOM access.
 * The reactive wrapper lives in `editor-interaction-store.svelte.ts`. Side
 * effects are returned in the result and applied by the caller; this keeps the
 * reducer trivially testable.
 */

export type FSMState = 'Idle' | 'Hover' | 'Selected' | 'Dragging';

export type PlacementId = string;

export type FSMEvent =
	| { type: 'POINTER_MOVE'; target: PlacementId | null }
	| { type: 'CLICK'; target: PlacementId | null; shift: boolean; meta: boolean }
	| { type: 'ESC' }
	| { type: 'KEY_W' | 'KEY_E' | 'KEY_R' | 'KEY_T' | 'KEY_X' }
	| { type: 'SELECTION_SET_CHANGE' }
	| {
			type: 'ACTIVE_TARGET_CHANGE';
			/** Collision-safe adapter key of the live attachable gizmo target, or null when detached. */
			targetKey: string | null;
	  }
	| { type: 'DRAG_START' }
	| { type: 'DRAG_END'; cancelled: boolean };

export interface SideEffect {
	apply(): void;
}

export class CommitDragSideEffect implements SideEffect {
	apply(): void {
		// Caller (sub-store) tracks currently-dragging flag and resets cursor.
	}
}

export class RevertDragSideEffect implements SideEffect {
	apply(): void {
		// Caller (sub-store) calls restoreDragSnapshot on the placement roots.
	}
}

export interface ReduceResult {
	state: FSMState;
	effects: SideEffect[];
}

/**
 * Reduce `(state, event) → { next state, side effects }`. Pure: never reads
 * or mutates anything outside its arguments.
 *
 * Transition policy (locks Q1-Q10 from the Phase 6.1 design doc, amended by
 * ):
 *  - POINTER_MOVE: Idle/Hover follow the target's presence; Selected and
 *    Dragging ignore the cursor (hover is a sibling concern).
 *  - CLICK: empty target → Idle. With target → Selected, including shifts
 *    used as modifiers for multi-select (handled at the click-routing layer).
 *  - ACTIVE_TARGET_CHANGE: `Selected` now means a live attachable gizmo
 *    target exists, not merely some editor selection. Outside Dragging,
 *    targetKey present → Selected; `null` → Idle. Ignored during Dragging.
 *  - DRAG_START: only from Selected.
 *  - DRAG_END: from Dragging only; emits a Commit or Revert side effect.
 *  - ESC: shell-level event only (idle deselect / camera-preview cascade).
 *    A live gizmo drag never dispatches ESC — the host routes every cancel
 *    reason (Escape included) through the active adapter's cancel + a
 *    `DRAG_END { cancelled: true }`, so ESC during Dragging is a dead branch
 *    and leaves the state untouched.
 *  - KEY_W/E/R/T/X: not state-mutating (the sub-store tracks mode/space).
 */
export function reduce(state: FSMState, event: FSMEvent): ReduceResult {
	const effects: SideEffect[] = [];
	let next: FSMState = state;

	switch (event.type) {
		case 'POINTER_MOVE':
			if (state === 'Idle') {
				next = event.target ? 'Hover' : 'Idle';
			} else if (state === 'Hover') {
				next = event.target ? 'Hover' : 'Idle';
			} else {
				// Selected + Dragging freeze hover: hover helper is a sibling
				// concern (EditorSelectionHelper) and updates from POINTER_MOVE
				// but does not change the FSM state.
				next = state;
			}
			break;

		case 'CLICK':
			if (state === 'Idle' || state === 'Hover') {
				next = event.target === null ? 'Idle' : 'Selected';
			} else if (state === 'Selected') {
				next = event.target === null ? 'Idle' : 'Selected';
			} else if (state === 'Dragging') {
				// Click never mutates state during Dragging — the gizmo drag
				// in progress consumes pointerdown via Three TransformControls.
				next = state;
			}
			break;

		case 'DRAG_START':
			if (state === 'Selected') {
				next = 'Dragging';
			}
			break;

		case 'DRAG_END': {
			if (state === 'Dragging') {
				next = 'Selected';
				effects.push(event.cancelled ? new RevertDragSideEffect() : new CommitDragSideEffect());
			}
			break;
		}

		case 'SELECTION_SET_CHANGE':
			// The selection-set boundary resets gizmo mode + space in the
			// sub-store, but the FSM state itself does not pivot here.
			next = state;
			break;

		case 'ACTIVE_TARGET_CHANGE': {
			// The host attaches a live, session-backed gizmo target before
			// dispatching this event; a layout selection without an adapter
			// dispatches `targetKey: null` and therefore never reaches
			// Selected. Ignored while a drag is in flight: the host cancels a
			// live session first (`DRAG_END { cancelled: true }`), so a stale
			// sync event can never flip Dragging back to Selected.
			if (state !== 'Dragging') {
				next = event.targetKey === null ? 'Idle' : 'Selected';
			}
			break;
		}

		case 'ESC': {
			// shell-level Escape only: idle deselect / camera-preview
			// cascade. `Dragging` ignores ESC (the host never dispatches it
			// from a live gizmo drag; every cancel reason routes through the
			// adapter's cancel + `DRAG_END { cancelled: true }`).
			if (state === 'Hover' || state === 'Selected' || state === 'Idle') {
				next = 'Idle';
			}
			break;
		}

		case 'KEY_W':
		case 'KEY_E':
		case 'KEY_R':
		case 'KEY_T':
		case 'KEY_X':
			// Mode/space toggles — handled by the sub-store, not the FSM.
			next = state;
			break;
	}

	return { state: next, effects };
}
