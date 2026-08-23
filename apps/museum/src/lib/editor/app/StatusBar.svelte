<!-- P1.1 (design-spec §2/§18) — the persistent bottom status bar, mounted in
     every workspace. Informational/supporting infrastructure only: current
     workspace, selection, save state, navigation hints, and viewport
     settings. Major authoring actions MUST NOT migrate into it. -->
<script lang="ts">
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import type { LayoutInteractionState } from '$lib/editor/layout/layout-interaction';
	import {
		layoutPreviewIsDirty,
		type LayoutPreviewState
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorActiveSelectionStore } from './active-editor-selection.svelte';
	import type { EditorViewState } from './editor-view-state.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		viewState,
		activeSelection
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		viewState: EditorViewState;
		activeSelection: EditorActiveSelectionStore;
	} = $props();

	const domainLabel = $derived(viewState.domain === 'scene' ? 'Scene' : 'Camera');
	const viewLabel = $derived(viewState.activeView === 'plan' ? 'Plan' : '3D');
	const isPlan = $derived(viewState.activeView === 'plan');
	const dirty = $derived(store.isDirty || layoutPreviewIsDirty(layoutPreview));
	const gridLabel = $derived(
		(isPlan ? layoutInteraction.planView.gridEnabled : store.gridVisible) ? 'Grid on' : 'Grid off'
	);
	const transformSnapEnabled = $derived(
		store.transformMode === 'translate'
			? store.translationSnapEnabled
			: store.transformMode === 'rotate'
				? store.rotationSnapEnabled
				: store.scaleSnapEnabled
	);
	const snapLabel = $derived(
		isPlan
			? `Snap 0.25 m ${layoutInteraction.planView.snapEnabled ? 'on' : 'off'}`
			: `Snap ${transformSnapEnabled ? 'on' : 'off'}`
	);
	const selectionLabel = $derived.by(() => {
		const active = activeSelection.active;
		switch (active.domain) {
			case 'none':
				return 'No selection';
			case 'layout':
				return 'Layout selection';
			case 'camera':
				return 'Camera selection';
			case 'scene': {
				const selection = active.selection;
				if (selection.kind === 'cluster') return 'Cluster selected';
				if (selection.kind === 'placement') {
					return `${selection.ids.length} ${selection.ids.length === 1 ? 'item' : 'items'} selected`;
				}
				return 'No selection';
			}
		}
	});
</script>

<footer class="status-bar" aria-label="Editor status" style="grid-area: status;">
	<div class="status-left">
		<span class="workspace">{domainLabel} • {viewLabel}</span>
		<span class="selection">{selectionLabel}</span>
		<span class:dirty class="save-state">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
	</div>
	<div class="status-center" aria-hidden="true">
		{#if isPlan}
			<span>Middle + Drag pan</span>
			<span>Scroll zoom</span>
			<span>Shift angle snap</span>
		{:else}
			<span>Alt + Drag orbit</span>
			<span>Shift + Drag pan</span>
			<span>Scroll zoom</span>
		{/if}
	</div>
	<div class="status-right">
		<span>{gridLabel}</span>
		<span>{snapLabel}</span>
		<span>Metric (m)</span>
	</div>
</footer>

<style>
	.status-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 1.7rem;
		padding: 0.2rem 0.75rem;
		box-sizing: border-box;
		border-top: 1px solid #2a2a33;
		background: #101016;
		color: #77736d;
		font-size: 0.64rem;
		line-height: 1;
	}
	.status-left,
	.status-right {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}
	.status-right { margin-left: auto; }
	.workspace { font-weight: 650; color: #a8a29a; }
	.selection { color: #918c84; }
	.save-state { color: #cfe9c4; }
	.save-state.dirty { color: #f4dc9b; }
	.status-center {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin: 0 auto;
		color: #6f6b66;
	}
	.status-center span { white-space: nowrap; }

	@media (max-width: 62rem) {
		.status-center { display: none; }
	}
	@media (max-width: 44rem) {
		.save-state { display: none; }
		.status-right span:nth-child(2) { display: none; }
	}
</style>
