<script lang="ts">
	import {
		cancelLayoutPrimitiveDraft,
		clearLayoutDraft,
		setLayoutDraftTool,
		setPlanViewMode,
		setLayoutViewMode,
		togglePlanViewportOption,
		type LayoutInteractionState,
		type LayoutDraftTool,
		type LayoutViewMode
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import { toggleLayoutCeilings } from './layout-preview-state.svelte';

	let {
		ribbon = false,
		interaction,
		preview,
		onCancelLayoutTransaction = () => false,
		showViewToggle = true,
		showPlanModeToggle = false,
		onPlanModeChange
	}: {
		ribbon?: boolean;
		interaction: LayoutInteractionState;
		preview: LayoutPreviewState;
		onCancelLayoutTransaction?: () => boolean;
		/** the editor hides this when the top-level Plan | 3D switch owns view selection. */
		showViewToggle?: boolean;
		/** Scene Plan only; absent on Camera Plan, Scene 3D, and the relic. */
		showPlanModeToggle?: boolean;
		onPlanModeChange?: (mode: 'layout' | 'staging') => void;
	} = $props();

	function chooseView(mode: LayoutViewMode) {
		if (interaction.roomUnitDrag) onCancelLayoutTransaction();
		setLayoutViewMode(interaction, mode);
	}

	function chooseTool(tool: LayoutDraftTool) {
		if (interaction.roomUnitDrag) onCancelLayoutTransaction();
		setLayoutDraftTool(interaction, tool);
	}

	function choosePlanMode(mode: 'layout' | 'staging') {
		if (onPlanModeChange) onPlanModeChange(mode);
		else setPlanViewMode(interaction, mode);
	}

	function cancel() {
		if (interaction.roomUnitDrag) onCancelLayoutTransaction();
		clearLayoutDraft(interaction);
		cancelLayoutPrimitiveDraft(interaction);
		if (interaction.tool === 'door' || interaction.tool === 'window') setLayoutDraftTool(interaction, 'select');
	}
</script>

<div class="layout-toolbar" class:ribbon role="toolbar" aria-label={interaction.planViewMode === 'staging' ? 'Scene Plan arrange tools' : 'Layout drafting tools'}>
	{#if showPlanModeToggle}
		<div class="tool-group mode-group" role="group" aria-label="Scene Plan mode">
			<button type="button" class:active={interaction.planViewMode === 'layout'} aria-pressed={interaction.planViewMode === 'layout'} onclick={() => choosePlanMode('layout')}>Layout</button>
			<button type="button" class:active={interaction.planViewMode === 'staging'} aria-pressed={interaction.planViewMode === 'staging'} onclick={() => choosePlanMode('staging')}>Arrange</button>
		</div>
	{/if}
	{#if showViewToggle}
		<div class="tool-group" aria-label="Layout view">
			<button type="button" class:active={interaction.viewMode === 'plan'} aria-pressed={interaction.viewMode === 'plan'} onclick={() => chooseView('plan')}>Plan</button>
			<button type="button" class:active={interaction.viewMode === '3d'} aria-pressed={interaction.viewMode === '3d'} onclick={() => chooseView('3d')}>3D</button>
		</div>
	{/if}
	<div class="tool-group" aria-label="Room drafting tool">
		<button type="button" class:active={interaction.tool === 'select'} aria-pressed={interaction.tool === 'select'} onclick={() => chooseTool('select')}>Select</button>
		{#if interaction.planViewMode === 'layout'}
			<button type="button" class:active={interaction.tool === 'rectangle'} aria-pressed={interaction.tool === 'rectangle'} onclick={() => chooseTool('rectangle')}>Rect room</button>
			<button type="button" class:active={interaction.tool === 'polygon'} aria-pressed={interaction.tool === 'polygon'} onclick={() => chooseTool('polygon')}>Polygon room</button>
		{/if}
	</div>
	{#if ribbon || interaction.viewMode === 'plan'}
		<div class="tool-group options" aria-label="Plan options">
			<button type="button" class:active={interaction.planView.snapEnabled} aria-pressed={interaction.planView.snapEnabled} onclick={() => togglePlanViewportOption(interaction, 'snapEnabled')}>Snap 0.25m</button>
			<button type="button" class:active={interaction.planView.gridEnabled} aria-pressed={interaction.planView.gridEnabled} onclick={() => togglePlanViewportOption(interaction, 'gridEnabled')}>Grid</button>
			{#if interaction.planViewMode === 'layout'}
				<button type="button" class:active={interaction.planView.showTourOverlay} aria-pressed={interaction.planView.showTourOverlay} onclick={() => togglePlanViewportOption(interaction, 'showTourOverlay')}>Tour</button>
			{/if}
		</div>
	{:else}
		<button type="button" class:active={preview.showCeilings} aria-pressed={preview.showCeilings} onclick={() => toggleLayoutCeilings(preview)}>Ceiling</button>
	{/if}
	{#if interaction.planViewMode === 'layout' && (interaction.polygonPoints.length > 0 || interaction.rectangleStart || interaction.primitiveDraft || interaction.roomUnitDrag || interaction.tool === 'door' || interaction.tool === 'window')}
		<button type="button" class="cancel" onclick={cancel}>Cancel</button>
	{/if}
</div>

<style>
	.layout-toolbar { position: absolute; top: 0.75rem; left: 0.75rem; z-index: 4; display: flex; gap: 0.3rem; padding: 0.3rem; border: 1px solid var(--editor-border-normal); border-radius: 0.42rem; background: var(--editor-bg-panel-raised); box-shadow: var(--editor-shadow-toolbar); }
	.tool-group { display: flex; gap: 0.22rem; padding-right: 0.32rem; border-right: 1px solid var(--editor-border-subtle); }
	.tool-group.options { border-right: 0; }
	button { padding: 0.38rem 0.52rem; border: 1px solid transparent; border-radius: 0.3rem; background: transparent; color: var(--editor-text-secondary); font: 600 0.68rem/1 var(--editor-font); cursor: pointer; }
	button:hover { border-color: var(--editor-border-strong); color: var(--editor-text-primary); }
	button.active { border-color: var(--editor-accent-border); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	button.cancel { border-color: var(--editor-danger-border); color: var(--editor-danger-fg); }
	@media (max-width: 44rem) {
		.layout-toolbar { top: 0.5rem; left: 0.5rem; right: 0.5rem; flex-wrap: wrap; }
		.tool-group { flex: 1 1 auto; }
		.tool-group button { flex: 1; }
	}
	.layout-toolbar.ribbon { position:relative; inset:auto; transform:none; flex:1; min-width:0; height:28px; padding:0; border:0; border-radius:0; box-shadow:none; background:transparent; backdrop-filter:none; flex-wrap:nowrap; align-items:center; }
	.ribbon button { height:28px; padding:0 6px; white-space:nowrap; }
	.ribbon button.active { background:var(--editor-bg-control); color:var(--editor-accent); }
	.ribbon .options { margin-left:auto; }
</style>
