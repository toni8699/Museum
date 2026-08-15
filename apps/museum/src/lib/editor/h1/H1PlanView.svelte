<script lang="ts">
	import LayoutDraftToolbar from '$lib/editor/layout/LayoutDraftToolbar.svelte';
	import LayoutPlanViewport from '$lib/editor/layout/LayoutPlanViewport.svelte';
	import type { LayoutInteractionState } from '$lib/editor/layout/layout-interaction';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutDraftRoom,
		commitLayoutOpening,
		deleteLayoutOpening
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import type { LayoutOpeningKind } from '$lib/editor/layout/layout-opening-editing';
	import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
	} = $props();

	function commitDraftRoom(points: [number, number][]): boolean {
		const result = commitLayoutDraftRoom(layoutPreview, points);
		if (result.success) {
			store.setStatusMessage(`Created ${result.roomId}`);
		} else {
			store.setStatusMessage(`Room draft rejected: ${result.message}`);
		}
		return result.success;
	}

	function createOpening(roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) {
		const result = commitLayoutOpening(layoutPreview, roomId, segmentId, kind, clickOffset, layoutInteraction.planView.snapEnabled);
		if (result.success) {
			layoutInteraction.selection = { kind: 'opening', roomId, segmentId, openingId: result.openingId };
		}
		store.setStatusMessage(result.success ? `Created ${kind} opening` : `Opening rejected: ${result.message}`);
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

	function deleteOpening(roomId: string, openingId: string) {
		const selection = layoutInteraction.selection;
		const result = deleteLayoutOpening(layoutPreview, roomId, openingId);
		if (result.success && selection.kind === 'opening' && selection.openingId === openingId) {
			layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		store.setStatusMessage(result.success ? 'Deleted opening' : `Opening delete failed: ${result.message}`);
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
		onLayoutTransactionBegin={beginLayoutTransaction}
		onLayoutTransactionCommit={commitLayoutTransaction}
		onLayoutTransactionCancel={cancelLayoutTransaction}
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
	}
</style>
