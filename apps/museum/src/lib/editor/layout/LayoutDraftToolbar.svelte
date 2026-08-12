<script lang="ts">
	import {
		clearLayoutDraft,
		cancelLayoutPendingObject,
		setLayoutDraftTool,
		setLayoutPendingObjectKind,
		setLayoutViewMode,
		type LayoutInteractionState,
		type LayoutDraftTool,
		type LayoutViewMode
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import { toggleLayoutCeilings } from './layout-preview-state.svelte';

	let { interaction, preview }: { interaction: LayoutInteractionState; preview: LayoutPreviewState } = $props();

	function chooseView(mode: LayoutViewMode) {
		setLayoutViewMode(interaction, mode);
	}

	function chooseTool(tool: LayoutDraftTool) {
		setLayoutDraftTool(interaction, tool);
	}

	function cancel() {
		clearLayoutDraft(interaction);
		cancelLayoutPendingObject(interaction);
	}
</script>

<div class="layout-toolbar" role="toolbar" aria-label="Layout drafting tools">
	<div class="tool-group" aria-label="Layout view">
		<button type="button" class:active={interaction.viewMode === 'plan'} aria-pressed={interaction.viewMode === 'plan'} onclick={() => chooseView('plan')}>Plan</button>
		<button type="button" class:active={interaction.viewMode === '3d'} aria-pressed={interaction.viewMode === '3d'} onclick={() => chooseView('3d')}>3D</button>
	</div>
	<div class="tool-group" aria-label="Drafting tool">
		<button type="button" class:active={interaction.tool === 'select'} aria-pressed={interaction.tool === 'select'} onclick={() => chooseTool('select')}>Select</button>
		<button type="button" class:active={interaction.tool === 'rectangle'} aria-pressed={interaction.tool === 'rectangle'} onclick={() => chooseTool('rectangle')}>Rectangle</button>
		<button type="button" class:active={interaction.tool === 'polygon'} aria-pressed={interaction.tool === 'polygon'} onclick={() => chooseTool('polygon')}>Polygon</button>
		<button type="button" class:active={interaction.tool === 'door'} aria-pressed={interaction.tool === 'door'} onclick={() => chooseTool('door')}>Door</button>
			<button type="button" class:active={interaction.tool === 'window'} aria-pressed={interaction.tool === 'window'} onclick={() => chooseTool('window')}>Window</button>
			<button type="button" class:active={interaction.tool === 'object'} aria-pressed={interaction.tool === 'object'} onclick={() => chooseTool('object')}>Object</button>
		</div>
		{#if interaction.tool === 'object' && interaction.pendingObject}
			<label class="object-kind">Kind
				<select value={interaction.pendingObject.kind} onchange={(event) => setLayoutPendingObjectKind(interaction, (event.currentTarget as HTMLSelectElement).value as 'box' | 'plane' | 'cylinder' | 'sphere')}>
					<option value="box">Box</option>
					<option value="plane">Plane</option>
					<option value="cylinder">Cylinder</option>
					<option value="sphere">Sphere</option>
				</select>
			</label>
		{/if}
	{#if interaction.viewMode === 'plan'}
		<div class="tool-group options" aria-label="Plan options">
			<button type="button" class:active={interaction.planView.snapEnabled} aria-pressed={interaction.planView.snapEnabled} onclick={() => (interaction.planView.snapEnabled = !interaction.planView.snapEnabled)}>Snap 0.25m</button>
			<button type="button" class:active={interaction.planView.gridEnabled} aria-pressed={interaction.planView.gridEnabled} onclick={() => (interaction.planView.gridEnabled = !interaction.planView.gridEnabled)}>Grid</button>
		</div>
	{:else}
		<button type="button" class:active={preview.showCeilings} aria-pressed={preview.showCeilings} onclick={() => toggleLayoutCeilings(preview)}>Ceiling</button>
	{/if}
		{#if interaction.polygonPoints.length > 0 || interaction.rectangleStart || interaction.pendingObject}
		<button type="button" class="cancel" onclick={cancel}>Cancel</button>
	{/if}
</div>

<style>
	.layout-toolbar { position: absolute; top: 0.75rem; left: 0.75rem; z-index: 4; display: flex; gap: 0.3rem; padding: 0.3rem; border: 1px solid #46444e; border-radius: 0.42rem; background: rgb(19 19 26 / 94%); box-shadow: 0 0.4rem 1.25rem rgb(0 0 0 / 28%); }
	.tool-group { display: flex; gap: 0.22rem; padding-right: 0.32rem; border-right: 1px solid #34343e; }
	.tool-group.options { border-right: 0; }
	.object-kind { display: flex; align-items: center; gap: 0.3rem; padding: 0 0.35rem; color: #a8a29a; font: 600 0.66rem/1 ui-sans-serif, system-ui, sans-serif; }
	.object-kind select { padding: 0.3rem; border: 1px solid #46444e; border-radius: 0.28rem; background: #17171f; color: #f4efe4; font: inherit; }
	button { padding: 0.38rem 0.52rem; border: 1px solid transparent; border-radius: 0.3rem; background: transparent; color: #c9c3b8; font: 600 0.68rem/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
	button:hover { border-color: #5a5663; color: #fff; }
	button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
	button.cancel { border-color: #684147; color: #efc7c7; }
	@media (max-width: 44rem) {
		.layout-toolbar { top: 0.5rem; left: 0.5rem; right: 0.5rem; flex-wrap: wrap; }
		.tool-group { flex: 1 1 auto; }
		.tool-group button { flex: 1; }
	}
</style>
