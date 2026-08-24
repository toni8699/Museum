/**
 * P3.4 — Scene Plan menu models.
 *
 * Layout mode resolves through `resolvePlanHit` (room / opening / object);
 * Arrange mode routes through the P10 owner-aware `resolveArrangeHit`
 * target — layout-object targets use the existing Layout commands, scene
 * targets use the existing Scene commands. NO second hit resolver and no
 * new mutators: deletes go through the same guarded layout runner /
 * placement-cluster paths the kebab and Inspector already call.
 *
 * One gesture = one document = at most one correctly tagged history entry;
 * room ownership is never inferred from coordinates here.
 */
import type { ContextMenuItem } from './context-menu-state.svelte';
import { buildSceneEntityContextMenuItems } from './scene-menu-items';

export type PlanLayoutTarget =
	| { kind: 'room'; roomId: string }
	| { kind: 'opening'; roomId: string; openingId: string }
	| { kind: 'object'; objectId: string };

export type PlanLayoutMenuActions = {
	renameRoom(roomId: string): void;
	deleteRoom(roomId: string): void;
	deleteOpening(roomId: string, openingId: string): void;
	deleteObject(objectId: string): void;
};

export function buildPlanLayoutContextMenuItems(input: {
	target: PlanLayoutTarget;
	mutationBlockedReason: string | null;
	actions: PlanLayoutMenuActions;
}): ContextMenuItem[] {
	const { target } = input;
	const deleteDisabled = input.mutationBlockedReason;
	if (target.kind === 'room') {
		return [
			{
				id: 'rename-room',
				label: 'Rename…',
				disabledReason: input.mutationBlockedReason,
				run: () => input.actions.renameRoom(target.roomId)
			},
			{
				id: 'delete-room',
				label: 'Delete room',
				danger: true,
				separatorBefore: true,
				disabledReason: deleteDisabled,
				run: () => input.actions.deleteRoom(target.roomId)
			}
		];
	}
	if (target.kind === 'opening') {
		return [
			{
				id: 'delete-opening',
				label: 'Delete opening',
				danger: true,
				disabledReason: deleteDisabled,
				run: () => input.actions.deleteOpening(target.roomId, target.openingId)
			}
		];
	}
	return [
		{
			id: 'delete-object',
			label: 'Delete object',
			danger: true,
			disabledReason: deleteDisabled,
			run: () => input.actions.deleteObject(target.objectId)
		}
	];
}

export type ArrangeOwnerTarget =
	| { owner: 'layout-object'; objectId: string }
	| { owner: 'scene'; entityId: string };

/**
 * Owner-routed Arrange items. The caller has ALREADY applied
 * selection-before-menu through the same functions the left-click path uses;
 * these closures only invoke existing commands.
 */
export function buildArrangeContextMenuItems(input: {
	target: ArrangeOwnerTarget;
	/** Session-only hidden state for scene-entity targets. */
	sceneTargetHidden?: boolean;
	mutationBlockedReason: string | null;
	/** Arrange-mode Scene authority gate (mirrors canDeleteSceneSelection). */
	sceneAuthorityBlockedReason?: string | null;
	duplicateBlockedReason?: string | null;
	actions: {
		deleteLayoutObject(objectId: string): void;
		duplicateScene(): void;
		focusScene(entityId: string): void;
		toggleSceneVisibility(entityId: string): void;
		deleteScene(): void;
	};
}): ContextMenuItem[] {
	const target = input.target;
	if (target.owner === 'layout-object') {
		return [
			{
				id: 'delete-layout-object',
				label: 'Delete object',
				danger: true,
				disabledReason: input.mutationBlockedReason,
				run: () => input.actions.deleteLayoutObject(target.objectId)
			}
		];
	}
	return buildSceneEntityContextMenuItems({
		targetHidden: input.sceneTargetHidden ?? false,
		mutationBlockedReason: input.sceneAuthorityBlockedReason ?? input.mutationBlockedReason,
		duplicateBlockedReason: input.duplicateBlockedReason,
		actions: {
			duplicate: input.actions.duplicateScene,
			focus: () => input.actions.focusScene(target.entityId),
			toggleVisibility: () => input.actions.toggleSceneVisibility(target.entityId),
			deleteSelection: input.actions.deleteScene
		}
	});
}
