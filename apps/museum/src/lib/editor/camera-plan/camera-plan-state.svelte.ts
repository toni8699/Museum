import { createPlanViewportState, type PlanViewportState } from '../layout/layout-plan-transform';
import type { CameraPlanHit } from './camera-plan-hit';

/**
 * Camera Plan session state (P1.5). Owned by `EditorApp` high enough to
 * survive the Camera Plan ↔ Camera 3D component swap, and deliberately
 * separate from Scene Plan's `LayoutInteractionState`. Pan/zoom/grid/snap and
 * the local Select/View tool live here; Add Camera and Connect are **not**
 * local FSM states — their active state derives from
 * `store.pendingNavigationCommand` and survives a view switch.
 */

export type CameraPlanTool = 'select' | 'view';

export type CameraPlanState = {
	tool: CameraPlanTool;
	planView: PlanViewportState;
	/** Screen-tolerance hover, purely visual (node/anchor/edge). */
	hover: CameraPlanHit;
};

export function createCameraPlanState(): CameraPlanState {
	return {
		tool: 'select',
		planView: createPlanViewportState(),
		hover: null
	};
}

/** Switch the local tool; returns false when already on `tool`. */
export function setCameraPlanTool(
	state: CameraPlanState,
	tool: CameraPlanTool
): boolean {
	if (tool === state.tool) return false;
	state.tool = tool;
	return true;
}
