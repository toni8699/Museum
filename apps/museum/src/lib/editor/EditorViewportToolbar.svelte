<script lang="ts">
	import type { EditorTransformMode } from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import { onMount, getContext } from 'svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	let viewMenuOpen = $state(false);
	let toolbarElement = $state<HTMLElement>();
	const disabled = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	const hasNavigationTransform = $derived(
		store.navigationSelection?.kind === 'node' ||
			store.navigationSelection?.kind === 'anchor' ||
			store.navigationSelection?.kind === 'view-keyframe'
	);

	function chooseTool(tool: 'select' | EditorTransformMode) {
		if (tool === 'select') {
			store.setTransformTool(tool);
		} else {
			store.setTransformTool(tool);
			interactionStore?.setMode(tool);
		}
	}

	function toolIsActive(mode: EditorTransformMode) {
		if (!store.transformGizmoVisible) return false;
		const effectiveMode = interactionStore?.mode ?? store.transformMode;
		return hasNavigationTransform ? mode === 'translate' : effectiveMode === mode;
	}

	function toggleViewMenu() {
		if (store.currentWorkspace !== 'camera') return;
		viewMenuOpen = !viewMenuOpen;
	}

	onMount(() => {
		const closeMenu = (event: PointerEvent) => {
			if (toolbarElement?.contains(event.target as Node)) return;
			viewMenuOpen = false;
		};
		window.addEventListener('pointerdown', closeMenu);
		return () => window.removeEventListener('pointerdown', closeMenu);
	});
</script>

<div bind:this={toolbarElement} class="toolbar" role="toolbar" aria-label="Viewport tools">
	<div class="tool-group" aria-label="Transform tool">
		<button
			type="button"
			class:active={!store.transformGizmoVisible}
			aria-pressed={!store.transformGizmoVisible}
			{disabled}
			onclick={() => chooseTool('select')}
		>Select</button>
		{#each [
			['translate', 'Move'],
			['rotate', 'Rotate'],
			['scale', 'Scale']
		] as [mode, label]}
			<button
				type="button"
				class:active={toolIsActive(mode as EditorTransformMode)}
				aria-pressed={toolIsActive(mode as EditorTransformMode)}
				disabled={disabled || (hasNavigationTransform && mode !== 'translate')}
				onclick={() => chooseTool(mode as EditorTransformMode)}
			>{label}</button>
		{/each}
	</div>

	{#if store.currentWorkspace === 'camera'}
		<div class="tool-group" aria-label="Viewport helper visibility">
			<button
				type="button"
				class:active={viewMenuOpen}
				aria-haspopup="menu"
				aria-expanded={viewMenuOpen}
				disabled={disabled}
				title="Toggle viewport helper visibility"
				onclick={toggleViewMenu}
			>View <span aria-hidden="true">▾</span></button>
			{#if viewMenuOpen}
				<div
					class="add-menu"
					role="menu"
					tabindex="-1"
					aria-label="Viewport helpers"
					onpointerdown={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowNodes}
						class="toggle-row"
						onclick={() => store.toggleViewportShowNodes()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowNodes ? '✓' : '○'}</span>
						<span>Node handles</span>
					</button>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowPaths}
						class="toggle-row"
						onclick={() => store.toggleViewportShowPaths()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowPaths ? '✓' : '○'}</span>
						<span>Tour paths</span>
					</button>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowFraming}
						class="toggle-row"
						onclick={() => store.toggleViewportShowFraming()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowFraming ? '✓' : '○'}</span>
						<span>Framing &amp; FOV</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toolbar {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.3rem;
		border: 1px solid rgb(70 68 78 / 88%);
		border-radius: 0.42rem;
		background: rgb(19 19 26 / 94%);
		box-shadow: 0 0.4rem 1.25rem rgb(0 0 0 / 28%);
		backdrop-filter: blur(8px);
	}

	.tool-group {
		display: flex;
		gap: 0.22rem;
		padding-right: 0.32rem;
		border-right: 1px solid #34343e;
	}

	button {
		white-space: nowrap;
		padding: 0.38rem 0.52rem;
		border: 1px solid transparent;
		border-radius: 0.3rem;
		background: transparent;
		color: #c9c3b8;
		font: 600 0.68rem/1 ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
	}

	button:hover:not(:disabled) { border-color: #5a5663; color: #fff; }
	button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
	button:disabled { opacity: 0.42; cursor: default; }

	.toggle-row { display: flex; align-items: center; gap: 0.55rem; }
	.toggle-row .check { width: 0.85rem; color: #d6b35f; font: inherit; font-size: 0.78rem; }

	@media (max-width: 44rem) {
		.toolbar {
			top: 0.5rem;
			left: 0.5rem;
			right: 0.5rem;
			align-items: stretch;
			flex-wrap: wrap;
		}
		.tool-group { flex: 1 1 auto; }
		.tool-group button { flex: 1; padding-inline: 0.38rem; }
	}
</style>
