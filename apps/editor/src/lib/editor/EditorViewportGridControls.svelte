<script lang="ts">
	import { Eye, EyeOff, Grid3x3 } from 'lucide-svelte';
	import type { EditorStore } from './editor-store.svelte';

	// S10.1.7 — grid control lives in the 3D viewport, bottom-right overlay
	// (not the sidebar, not the timeline): visibility toggle reuses
	// `session.gridVisible`; opacity slider drives `session.gridOpacity`.
	let { store }: { store: EditorStore } = $props();

	let open = $state(false);
	const gridVisible = $derived(store.gridVisible);
	const gridOpacity = $derived(store.gridOpacity);

	function toggleGrid() {
		store.toggleGrid();
	}

	function setOpacity(value: number) {
		store.gridOpacity = value;
	}
</script>

<div class="grid-controls">
	<button
		type="button"
		class="grid-toggle"
		class:open
		aria-haspopup="menu"
		aria-expanded={open}
		title="Grid visibility and opacity"
		onclick={() => (open = !open)}
	>
		<Grid3x3 size={14} aria-hidden="true" />
		<span>Grid</span>
	</button>
	{#if open}
		<div class="grid-popover" role="menu" aria-label="Grid controls">
			<button
				type="button"
				role="menuitemcheckbox"
				aria-checked={gridVisible}
				class="toggle-row"
				onclick={toggleGrid}
			>
				<span class="check" aria-hidden="true">
					{#if gridVisible}
						<Eye size={13} />
					{:else}
						<EyeOff size={13} />
					{/if}
				</span>
				<span>Show grid</span>
			</button>
			<label class="opacity-row">
				<span>Opacity</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={gridOpacity}
					disabled={!gridVisible}
					oninput={(event) => setOpacity(Number(event.currentTarget.value))}
				/>
				<span class="value">{Math.round(gridOpacity * 100)}%</span>
			</label>
		</div>
	{/if}
</div>

<style>
	.grid-controls {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		z-index: 4;
	}
	.grid-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.38rem 0.55rem;
		border: 1px solid color-mix(in srgb, var(--editor-border-normal) 88%, transparent);
		border-radius: 0.42rem;
		background: var(--editor-bg-panel-raised);
		box-shadow: var(--editor-shadow-toolbar);
		backdrop-filter: blur(8px);
		color: var(--editor-text-secondary);
		font: 600 0.68rem/1 var(--editor-font);
		cursor: pointer;
	}
	.grid-toggle:hover:not(:disabled),
	.grid-toggle.open { border-color: var(--editor-accent-border); color: var(--editor-text-primary); }
	.grid-popover {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.3rem);
		z-index: 20;
		display: flex;
		min-width: 11.5rem;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.35rem;
		border: 1px solid color-mix(in srgb, var(--editor-border-normal) 88%, transparent);
		border-radius: 0.42rem;
		background: color-mix(in srgb, var(--editor-bg-panel-raised) 96%, transparent);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 42%);
		backdrop-filter: blur(8px);
	}
	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.34rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 0.3rem;
		background: transparent;
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.68rem;
		text-align: left;
		cursor: pointer;
	}
	.toggle-row:hover { border-color: var(--editor-border-strong); color: var(--editor-text-primary); }
	.toggle-row .check { width: 0.85rem; color: var(--editor-accent); font-size: 0.78rem; }
	.opacity-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.45rem;
		color: var(--editor-text-secondary);
		font-size: 0.66rem;
	}
	.opacity-row input[type='range'] {
		width: 100%;
		accent-color: var(--editor-accent);
	}
	.opacity-row .value {
		min-width: 2.4rem;
		color: var(--editor-text-secondary);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.opacity-row input:disabled { opacity: 0.4; }
</style>
