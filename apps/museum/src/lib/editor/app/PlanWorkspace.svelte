<script lang="ts">
	import LayoutDraftToolbar from '$lib/editor/layout/LayoutDraftToolbar.svelte';
	import LayoutPlanViewport from '$lib/editor/layout/LayoutPlanViewport.svelte';
	import type { LayoutInteractionState } from '$lib/editor/layout/layout-interaction';
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
	import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import { getContext } from 'svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		type EditorActiveSelectionStore
	} from './active-editor-selection.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
	} = $props();
	const activeSelection = getContext<EditorActiveSelectionStore | undefined>(
		ACTIVE_EDITOR_SELECTION_KEY
	);

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
	/>
	<LayoutPlanViewport
		model={layoutPreview.model}
		preview={layoutPreview}
		interaction={layoutInteraction}
		onCommit={commitDraftRoom}
		onOpeningCreate={createOpening}
		onOpeningDelete={deleteOpening}
		onRoomDelete={deleteRoom}
		onLayoutTransactionBegin={beginLayoutTransaction}
		onLayoutTransactionCommit={commitLayoutTransaction}
		onLayoutTransactionCancel={cancelLayoutTransaction}
		onDeselect={activeSelection ? () => activeSelection.deselectActive() : undefined}
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
