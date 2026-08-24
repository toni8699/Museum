/**
 * P3.4 — Scene 3D / Arrange scene-entity menu model. Exposes EXISTING store
 * commands only (duplicate/focus/toggleVisibility/delete); every action the
 * caller wires must be a facade command the Inspector already uses.
 */
import type { ContextMenuItem } from './context-menu-state.svelte';

export type SceneEntityMenuActions = {
	duplicate(): void;
	focus(): void;
	toggleVisibility(): void;
	deleteSelection(): void;
};

export function buildSceneEntityContextMenuItems(input: {
	/** Session-only visibility override state (drives the Hide/Show label). */
	targetHidden: boolean;
	/** Disabled reason for document mutations, or null when allowed. */
	mutationBlockedReason: string | null;
	/** Duplicate needs a selection; commands self-guard but the menu shows why. */
	duplicateBlockedReason?: string | null;
	actions: SceneEntityMenuActions;
}): ContextMenuItem[] {
	const blocked = input.mutationBlockedReason;
	return [
		{
			id: 'duplicate',
			label: 'Duplicate',
			disabledReason: input.duplicateBlockedReason ?? blocked,
			run: input.actions.duplicate
		},
		{
			id: 'focus',
			label: 'Focus',
			disabledReason: blocked,
			run: input.actions.focus
		},
		{
			id: 'toggle-visibility',
			label: input.targetHidden ? 'Show' : 'Hide',
			run: input.actions.toggleVisibility
		},
		{
			id: 'delete',
			label: 'Delete',
			danger: true,
			separatorBefore: true,
			disabledReason: blocked,
			run: input.actions.deleteSelection
		}
	];
}
