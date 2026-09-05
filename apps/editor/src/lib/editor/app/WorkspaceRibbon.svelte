<script lang="ts">
	import type { EditorStore } from '../editor-store.svelte';
	import type { EditorViewState } from './editor-view-state.svelte';
	import type { LayoutPreviewState } from '../layout/layout-preview-state.svelte';
	import { toggleLayoutCeilings } from '../layout/layout-preview-state.svelte';
	import { hasLayoutTransientInteraction, setPlanViewMode, type LayoutInteractionState } from '../layout/layout-interaction';
	import type { CameraPlanState } from '../camera-plan/camera-plan-state.svelte';
	import type { EditorGizmoCapabilities } from '../gizmo/editor-gizmo-policy';
	import LayoutDraftToolbar from '../layout/LayoutDraftToolbar.svelte';
	import CameraPlanToolbar from '../camera-plan/CameraPlanToolbar.svelte';
	import EditorViewportToolbar from '../EditorViewportToolbar.svelte';
	import EditorViewportGridControls from '../EditorViewportGridControls.svelte';

	let { store, viewState, layoutPreview, layoutInteraction, cameraPlan, gizmoCapabilities, transformDisabled, onDeleteArrange } : {
		store: EditorStore; viewState: EditorViewState; layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState; cameraPlan: CameraPlanState;
		gizmoCapabilities: EditorGizmoCapabilities | null; transformDisabled: boolean;
		onDeleteArrange?: () => boolean;
	} = $props();
	const canSwitch = $derived(!store.isEditorInteractionActive);
	function choosePlanMode(mode: 'layout' | 'staging') {
		if (mode === layoutInteraction.planViewMode) return;
		if (hasLayoutTransientInteraction(layoutInteraction)) store.cancelLayoutTransaction();
		setPlanViewMode(layoutInteraction, mode);
	}
</script>

<div class="workspace-ribbon" aria-label="Workspace ribbon" style="grid-area:ribbon;">
	<div class="zone-a">
		<div role="group" aria-label="Editor domain" class="segmented">
			{#each ['scene', 'camera'] as domain}
				<button disabled={!canSwitch} aria-pressed={viewState.domain === domain} class:active={viewState.domain === domain}
					onclick={() => { if (canSwitch) viewState.setDomain(domain as 'scene' | 'camera'); }}>{domain === 'scene' ? 'Scene' : 'Camera'}</button>
			{/each}
		</div>
		<div role="group" aria-label="Editor views" class="segmented">
			{#each ['plan', '3d'] as view}
				<button disabled={!canSwitch} aria-pressed={viewState.activeView === view} class:active={viewState.activeView === view}
					onclick={() => { if (canSwitch) viewState.setView(viewState.domain, view as 'plan' | '3d'); }}>{view === 'plan' ? 'Plan' : '3D'}</button>
			{/each}
		</div>
	</div>
	<div class="contextual-tools">
		{#if viewState.activeView === 'plan' && viewState.domain === 'scene'}
			<LayoutDraftToolbar ribbon interaction={layoutInteraction} preview={layoutPreview}
				showViewToggle={false} showPlanModeToggle onPlanModeChange={choosePlanMode}
				{onDeleteArrange}
				onCancelLayoutTransaction={() => store.cancelLayoutTransaction()} />
		{:else if viewState.activeView === 'plan'}
			<CameraPlanToolbar {store} {cameraPlan} />
		{:else}
			<EditorViewportToolbar ribbon {store} context={viewState.domain} {gizmoCapabilities} {transformDisabled}
				showCeilings={layoutPreview.showCeilings} onToggleCeilings={() => toggleLayoutCeilings(layoutPreview)} />
			<EditorViewportGridControls {store} />
		{/if}
	</div>
</div>

<style>
	.workspace-ribbon { display:flex; height:var(--editor-ribbon-height); min-width:0; box-sizing:border-box; background:var(--editor-bg-row-2); border-bottom:1px solid var(--editor-border-normal); z-index:20; }
	.zone-a { display:flex; align-items:center; gap:8px; flex:0 0 240px; box-sizing:border-box; padding:0 8px; border-right:1px solid var(--editor-border-subtle); }
	.segmented { display:flex; border:1px solid var(--editor-border-subtle); border-radius:4px; }
	button { height:26px; padding:0 7px; border:0; border-radius:3px; background:transparent; color:var(--editor-text-secondary); font:500 12px var(--editor-font); cursor:pointer; }
	button.active { background:var(--editor-bg-control); color:var(--editor-accent); }
	button:disabled { opacity:.5; cursor:default; }
	.contextual-tools { display:flex; align-items:center; gap:6px; flex:1; min-width:0; padding:0 8px; }
</style>
