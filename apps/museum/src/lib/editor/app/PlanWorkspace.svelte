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

	// room deletion: guarded layout transaction + reject-when-
	// scene-referenced policy (blockers read the store's authoritative scene).
	function deleteRoom(roomId: string): boolean {
		if (!store.beginLayoutTransaction()) {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		const result = deleteLayoutRoom(layoutPreview, roomId, store.document);
		if (!result.success) {
			store.cancelLayoutTransaction();
			store.setStatusMessage(`Room delete failed: ${result.message}`);
			return false;
		}
		store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview));
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
		/* S10.1.6 — Plan ↔ 3D mount fade (220–280 ms). */
		animation: plan-fade-in 240ms ease both;
	}
	@keyframes plan-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.plan-view { animation: none; }
	}
</style>
