<script lang="ts">
	import LayoutDraftToolbar from '$lib/editor/layout/LayoutDraftToolbar.svelte';
	import LayoutPlanViewport from '$lib/editor/layout/LayoutPlanViewport.svelte';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutDraftRoom,
		commitLayoutOpening,
		deleteLayoutOpening,
		deleteLayoutRoom
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import { layoutMutationRunnerFor, runLayoutMutation } from '$lib/editor/layout/layout-mutation-runner';
	import type { LayoutOpeningKind } from '$lib/editor/layout/layout-opening-editing';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import {
		hasLayoutTransientInteraction,
		setPlanViewMode,
		type PlanViewMode,
		type LayoutInteractionState
	} from '$lib/editor/layout/layout-interaction';
	import { resolveEditorPlacementScale } from '$lib/editor/scale-vector';
	import { placementTransformFromDocument } from '$lib/editor/editor-transform';
	import type { PlanSceneTransformPatch } from '$lib/editor/layout/plan-scene-transform';
	import type { SceneEntity } from '$lib/content/scene';
	import { getContext } from 'svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		type EditorActiveSelectionStore
	} from './active-editor-selection.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		active = true
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		/** Scene Plan visibility; false while keep-mounted Camera Plan owns the viewport. */
		active?: boolean;
	} = $props();
	const activeSelection = getContext<EditorActiveSelectionStore | undefined>(
		ACTIVE_EDITOR_SELECTION_KEY
	);

	function effectiveSceneScale(entity: SceneEntity) {
		void store.placementScaleVectorVersion;
		return resolveEditorPlacementScale(entity.scale, store.getPlacementScaleVector(entity.id));
	}

	function commitDraftRoom(points: [number, number][]): boolean {
		const outcome = runLayoutMutationGuarded(
			() => commitLayoutDraftRoom(layoutPreview, points),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		const result = outcome.result;
		if (result.success) {
			store.setStatusMessage(`Created ${result.roomId}`);
		} else {
			store.setStatusMessage(`Room draft rejected: ${result.message}`);
		}
		return result.success;
	}

	function createOpening(roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) {
		const outcome = runLayoutMutationGuarded(
			() => commitLayoutOpening(layoutPreview, roomId, segmentId, kind, clickOffset, layoutInteraction.planView.snapEnabled),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (outcome.result.success) {
			layoutInteraction.selection = { kind: 'opening', roomId, segmentId, openingId: outcome.result.openingId };
		}
		store.setStatusMessage(outcome.result.success ? `Created ${kind} opening` : `Opening rejected: ${outcome.result.message}`);
	}

	function beginLayoutTransaction(): boolean {
		return store.beginLayoutTransaction();
	}

	function commitLayoutTransaction(): boolean {
		return store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview));
	}

	function cancelLayoutTransaction(): boolean {
		return store.cancelLayoutTransaction();
	}

	function choosePlanMode(mode: PlanViewMode): void {
		if (mode === layoutInteraction.planViewMode) return;
		if (hasLayoutTransientInteraction(layoutInteraction)) cancelLayoutTransaction();
		setPlanViewMode(layoutInteraction, mode);
	}

	function enterStaging(entityId: string): void {
		choosePlanMode('staging');
		if (!store.selectionActions.selectPlacement(entityId)) {
			store.setStatusMessage('Scene item is no longer available');
		}
	}

	function selectSceneEntity(
		entityId: string,
		modifiers: { additive: boolean; toggle: boolean }
	): boolean {
		if (modifiers.toggle) return store.selectionActions.togglePlacement(entityId);
		if (modifiers.additive) {
			const ids = store.selectedPlacementIds.includes(entityId)
				? [...store.selectedPlacementIds]
				: [...store.selectedPlacementIds, entityId];
			return store.selectionActions.selectPlacements(ids);
		}
		return store.selectionActions.selectPlacement(entityId);
	}

	function deselectPlanActive(): boolean {
		return layoutInteraction.planViewMode === 'staging'
			? activeSelection?.deselectSceneSelection() ?? false
			: activeSelection?.deselectActive() ?? false;
	}

	function beginSceneGesture(): boolean {
		if (!store.beginDocumentTransaction()) return false;
		store.setTransformInteractionActive(true, 'placement');
		return true;
	}

	function previewSceneGesture(patches: readonly PlanSceneTransformPatch[]): boolean {
		for (const patch of patches) {
			const entity = store.document.entities.find((candidate) => candidate.id === patch.id);
			if (!entity) return false;
			const transform = placementTransformFromDocument(
				entity,
				store.getPlacementScaleVector(entity.id)
			);
			if (!store.updatePlacementTransform(entity.id, {
				...transform,
				position: [...patch.position],
				rotation: [...patch.rotation]
			})) return false;
		}
		return true;
	}

	function commitSceneGesture(): boolean {
		store.setTransformInteractionActive(false);
		return store.commitDocumentTransaction();
	}

	function cancelSceneGesture(): boolean {
		store.setTransformInteractionActive(false);
		return store.cancelDocumentTransaction();
	}

	function deleteSceneSelection(): boolean {
		return store.deleteSelection();
	}

	// one layout mutation = one undo entry: begin → mutate → commit/cancel.
	function runLayoutMutationGuarded<T>(mutate: () => T, didSucceed: (result: T) => boolean) {
		return runLayoutMutation(layoutMutationRunnerFor(store, layoutPreview), mutate, didSucceed);
	}

	function deleteOpening(roomId: string, openingId: string) {
		const selection = layoutInteraction.selection;
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutOpening(layoutPreview, roomId, openingId),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (outcome.result.success && selection.kind === 'opening' && selection.openingId === openingId) {
			layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		store.setStatusMessage(outcome.result.success ? 'Deleted opening' : `Opening delete failed: ${outcome.result.message}`);
	}

	// room deletion: guarded layout transaction + reject-when-
	// scene-referenced policy (blockers read the store's authoritative scene).
	function deleteRoom(roomId: string): boolean {
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutRoom(layoutPreview, roomId, store.document),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		if (!outcome.result.success) {
			store.setStatusMessage(`Room delete failed: ${outcome.result.message}`);
			return false;
		}
		layoutInteraction.selection = { kind: 'none' };
		store.setStatusMessage('Deleted room');
		return true;
	}
</script>

<div class="plan-view" role="application" aria-label="Plan drafting surface">
	<LayoutDraftToolbar
		interaction={layoutInteraction}
		preview={layoutPreview}
		onCancelLayoutTransaction={cancelLayoutTransaction}
		showViewToggle={false}
		showPlanModeToggle={active}
		onPlanModeChange={choosePlanMode}
	/>
	<LayoutPlanViewport
		model={layoutPreview.model}
		preview={layoutPreview}
		interaction={layoutInteraction}
		scene={store.document}
		rooms={store.rooms}
		getEffectiveSceneScale={effectiveSceneScale}
		selectedPlacementIds={store.selectedPlacementIds}
		selectedClusterId={store.selectedClusterId}
		active={active}
		onPlanModeChange={choosePlanMode}
		onEnterStaging={enterStaging}
		onSceneSelect={selectSceneEntity}
		onSceneGestureBegin={beginSceneGesture}
		onSceneGesturePreview={previewSceneGesture}
		onSceneGestureCommit={commitSceneGesture}
		onSceneGestureCancel={cancelSceneGesture}
		onSceneDelete={deleteSceneSelection}
		onCommit={commitDraftRoom}
		onOpeningCreate={createOpening}
		onOpeningDelete={deleteOpening}
		onRoomDelete={deleteRoom}
		onLayoutTransactionBegin={beginLayoutTransaction}
		onLayoutTransactionCommit={commitLayoutTransaction}
		onLayoutTransactionCancel={cancelLayoutTransaction}
		onDeselect={activeSelection ? deselectPlanActive : undefined}
	/>
</div>

<style>
	.plan-view {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: #0b0b10;
		/* S10.1.6 amendment — Plan ↔ 3D swaps are instant (no fade). */
	}
</style>
