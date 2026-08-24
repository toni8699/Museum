/**
 * P3.5 — Camera surface menu models. Menus bind to ACTUAL backing identities
 * (navigation node ids, connection ids, view-keyframe identities) — never the
 * cosmetic five-lane timeline labels. Every action calls an existing facade /
 * mutator command; validators only supply disabled reasons.
 *
 * `spatial: false` is the Camera 3D variant of the Camera Plan adapter (same
 * command set minus Plan-only spatial actions).
 */
import type { ContextMenuItem } from './context-menu-state.svelte';

export type CameraNodeMenuActions = {
	previewCamera(): void;
	addToSequence(): void;
	removeFromSequence(): void;
	rename(): void;
	deleteNode(): void;
};

export function buildCameraNodeContextMenuItems(input: {
	/** Camera 3D reuses this builder without the Plan-only spatial rows. */
	spatial: boolean;
	nodeOnSequence: boolean;
	mutationBlockedReason: string | null;
	/** Existing validator reasons (guided-tour / topology), or null when allowed. */
	addToSequenceReason?: string | null;
	removeFromSequenceReason?: string | null;
	deleteNodeReason?: string | null;
	actions: CameraNodeMenuActions;
}): ContextMenuItem[] {
	const blocked = input.mutationBlockedReason;
	const items: ContextMenuItem[] = [
		{
			id: 'preview-camera',
			label: 'Preview Camera',
			disabledReason: blocked,
			run: input.actions.previewCamera
		}
	];
	if (input.spatial) {
		items.push({
			id: 'add-to-sequence',
			label: input.nodeOnSequence ? 'Sequence order…' : 'Add to Sequence',
			disabledReason: input.nodeOnSequence
				? 'Already on the camera flow'
				: input.addToSequenceReason ?? blocked,
			run: input.actions.addToSequence
		});
	}
	items.push(
		{
			id: 'remove-from-sequence',
			label: 'Remove from Sequence',
			disabledReason: input.nodeOnSequence
				? input.removeFromSequenceReason ?? blocked
				: 'Not on the camera flow',
			run: input.actions.removeFromSequence
		},
		{
			id: 'rename-node',
			label: 'Rename…',
			disabledReason: blocked,
			run: input.actions.rename
		},
		{
			id: 'delete-node',
			label: 'Delete node',
			danger: true,
			separatorBefore: true,
			disabledReason: input.deleteNodeReason ?? blocked,
			run: input.actions.deleteNode
		}
	);
	return items;
}

export type CameraConnectionMenuActions = {
	openTiming(): void;
	toggleReverse(): void;
	deleteConnection(): void;
};

export function buildCameraConnectionContextMenuItems(input: {
	mutationBlockedReason: string | null;
	deleteReason?: string | null;
	actions: CameraConnectionMenuActions;
}): ContextMenuItem[] {
	return [
		{ id: 'timing', label: 'Timing…', disabledReason: input.mutationBlockedReason, run: input.actions.openTiming },
		{
			id: 'reverse',
			label: 'Reverse direction',
			disabledReason: input.mutationBlockedReason,
			run: input.actions.toggleReverse
		},
		{
			id: 'delete-connection',
			label: 'Delete connection',
			danger: true,
			separatorBefore: true,
			disabledReason: input.deleteReason ?? input.mutationBlockedReason,
			run: input.actions.deleteConnection
		}
	];
}

/**
 * Timeline view-key marker menu — resolves to the SAME backing
 * `SceneCameraViewKeyframe` identity and the same view-keyframe commands as a
 * left-click selection (`Shots`/`Roll` lanes have no store model and get no
 * menu of their own).
 */
export function buildViewKeyframeContextMenuItems(input: {
	mutationBlockedReason: string | null;
	actions: { deleteKeyframe(): void };
}): ContextMenuItem[] {
	return [
		{
			id: 'delete-keyframe',
			label: 'Delete keyframe',
			danger: true,
			disabledReason: input.mutationBlockedReason,
			run: input.actions.deleteKeyframe
		}
	];
}
