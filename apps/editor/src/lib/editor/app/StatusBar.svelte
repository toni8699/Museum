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
		activeSelection,
		transformSpace = 'local'
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		viewState: EditorViewState;
		activeSelection: EditorActiveSelectionStore;
		/** Scene 3D transform space (Local/World) — P21.2 status string. */
		transformSpace?: 'local' | 'world';
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
	// P21.2 — per-workspace status strings (§9 visual QA). Behavior unchanged;
	// presentation only. Camera Plan Y-preserved is included (P21.3 owns Camera
	// reconciliation but the string is low-risk and shared with the gap matrix).
	const isScenePlanLayout = $derived(
		viewState.domain === 'scene' && viewState.activeView === 'plan' && layoutInteraction.planViewMode === 'layout'
	);
	const isArrange = $derived(
		viewState.domain === 'scene' && viewState.activeView === 'plan' && layoutInteraction.planViewMode === 'staging'
	);
	const isScene3D = $derived(viewState.domain === 'scene' && viewState.activeView === '3d');
	const isCameraPlan = $derived(viewState.domain === 'camera' && viewState.activeView === 'plan');
	const isCamera3D = $derived(viewState.domain === 'camera' && viewState.activeView === '3d');
	// P21.3 — Camera 3D status reuses the preview FSM (no new state):
	// Observer/POV mode, Edge/Sequence scope from the preview kind, play
	// state, and selection count. Scope must follow the preview kind —
	// Sequence scope intentionally preserves an Edge selection, so deriving
	// scope from selection would misreport "Edge".
	const cameraModeLabel = $derived(store.cameraPreview?.mode === 'visitor' ? 'POV' : 'Observer');
	const cameraScopeLabel = $derived(store.cameraPreview?.kind === 'edge' ? 'Edge' : 'Sequence');
	const cameraPlayLabel = $derived(store.isCameraPreviewPlaying ? 'playing' : 'paused');
	const cameraSelectionCount = $derived(store.navigationSelection ? 1 : 0);
	const modeLabel = $derived(
		!store.transformGizmoVisible
			? 'Select'
			: store.transformMode === 'translate'
				? 'Move'
				: store.transformMode === 'rotate'
					? 'Rotate'
					: 'Scale'
	);
	const spaceLabel = $derived(transformSpace === 'world' ? 'World' : 'Local');
	const sceneSelectionCount = $derived(
		activeSelection.active.domain === 'scene' && activeSelection.active.selection.kind === 'placement'
			? activeSelection.active.selection.ids.length
			: store.selectedCluster
				? store.selectedPlacementIds.length
				: 0
	);
	const workspaceStatus = $derived(
		isScenePlanLayout
			? 'X/Z Grid Orthogonal WallSnap Angle Scene>Plan>Layout'
			: isArrange
				? 'Yaw Snap 15°'
				: isScene3D
					? `${modeLabel} ${spaceLabel} snaps ${sceneSelectionCount} selected`
					: isCameraPlan
						? 'Y Preserved'
						: isCamera3D
							? `${cameraModeLabel} ${cameraScopeLabel} ${cameraPlayLabel} ${cameraSelectionCount} selected`
							: null
	);
</script>

<footer class="status-bar" aria-label="Editor status" style="grid-area: status;">
	<div class="status-left">
		<span class="workspace">{domainLabel} • {viewLabel}</span>
		<span class="selection">{selectionLabel}</span>
		<span class:dirty class="save-state">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
	</div>
	{#if workspaceStatus}
		<span class="workspace-status" role="status">{workspaceStatus}</span>
	{/if}
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
		border-top: 1px solid var(--editor-border-subtle);
		background: var(--editor-bg-panel);
		color: var(--editor-text-muted);
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
	.workspace { font-weight: 650; color: var(--editor-text-secondary); }
	.workspace-status { color: var(--editor-text-secondary); font-weight: 600; white-space: nowrap; }
	.selection { color: var(--editor-text-muted); }
	.save-state { color: var(--editor-success); }
	.save-state.dirty { color: var(--editor-text-primary); }
	.status-center {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin: 0 auto;
		color: var(--editor-text-disabled);
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
