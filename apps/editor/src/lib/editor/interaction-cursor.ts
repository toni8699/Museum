/**
 * Phase 6.1 — pure cursor mapper.
 *
 * Maps the editor's interaction inputs (current FSM state, current hover
 * target id, whether a gizmo drag is in flight) to one of three CSS cursor
 * string values. Pure: no DOM access, no Three imports. The reactive wrapper
 * (`EditorInteractionStore.cursor`) reads from this and binds it onto the
 * canvas container at `EditorViewport.svelte`.
 */

import type { FSMState, PlacementId } from './store/interaction-fsm';

export interface CursorInputs {
	state: FSMState;
	hoverTargetId: PlacementId | null;
	/** True while a gizmo drag is in progress (TransformControls.dragging). */
	isDraggingCurrently: boolean;
}

export type Cursor = 'default' | 'pointer' | 'grabbing';

/**
 * Cursor policy:
 *  - During a gizmo drag, the cursor is "grabbing" regardless of FSM state.
 *  - Pointer is over a placement root → "pointer".
 *  - Otherwise → "default".
 */
export function computeCursor(input: CursorInputs): Cursor {
	if (input.isDraggingCurrently) return 'grabbing';
	if (input.hoverTargetId !== null) return 'pointer';
	return 'default';
}
