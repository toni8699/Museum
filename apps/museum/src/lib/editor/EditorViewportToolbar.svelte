<script lang="ts">
	import type { EditorTransformMode } from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import { onMount } from 'svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	let addMenuOpen = $state(false);
	let viewMenuOpen = $state(false);
	let toolbarElement = $state<HTMLElement>();
	const disabled = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	const hasPlacementSelection = $derived(store.selectedPlacementIds.length > 0);
	const hasNavigationTransform = $derived(
		store.navigationSelection?.kind === 'node' ||
		store.navigationSelection?.kind === 'anchor' ||
		store.navigationSelection?.kind === 'view-keyframe'
	);
	const canAddCamera = $derived(
		!disabled &&
		!store.pendingPlacementAssetId &&
		!store.pendingNavigationCommand
	);
	const activeSnap = $derived(
		hasPlacementSelection &&
		store.transformGizmoVisible &&
		((store.transformMode === 'translate' && store.translationSnapEnabled) ||
			(store.transformMode === 'rotate' && store.rotationSnapEnabled))
	);
	const snapLabel = $derived(
		hasNavigationTransform
			? 'Snap'
			: store.transformMode === 'translate'
			? `Snap ${store.translationSnap} m`
			: store.transformMode === 'rotate'
				? `Snap ${store.rotationSnapDegrees}°`
				: 'Snap'
	);

	function chooseTool(tool: 'select' | EditorTransformMode) {
		store.setTransformTool(tool);
		addMenuOpen = false;
	}

	function toolIsActive(mode: EditorTransformMode) {
		if (!store.transformGizmoVisible) return false;
		return hasNavigationTransform ? mode === 'translate' : store.transformMode === mode;
	}

	function addCamera() {
		if (!store.beginCameraPlacement()) return;
		addMenuOpen = false;
	}

	function toggleViewMenu() {
		if (store.currentWorkspace !== 'camera') return;
		viewMenuOpen = !viewMenuOpen;
	}

	onMount(() => {
		const closeMenu = (event: PointerEvent) => {
			if (toolbarElement?.contains(event.target as Node)) return;
			addMenuOpen = false;
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

	<div class="tool-group" aria-label="Transform options">
		<button
			type="button"
			class:active={hasPlacementSelection && store.transformSpace === 'local'}
			aria-pressed={hasPlacementSelection && store.transformSpace === 'local'}
			disabled={disabled || !hasPlacementSelection}
			title={hasPlacementSelection ? 'Toggle transform orientation' : 'Local space requires a placement selection'}
			onclick={() => store.setTransformSpace(store.transformSpace === 'local' ? 'world' : 'local')}
		>{hasPlacementSelection && store.transformSpace === 'local' ? 'Local' : 'World'}</button>
		<button
			type="button"
			class:active={activeSnap}
			aria-pressed={activeSnap}
			disabled={disabled || !hasPlacementSelection || !store.transformGizmoVisible || store.transformMode === 'scale'}
			title="Hold Shift while dragging to bypass snapping"
			onclick={() => store.toggleActiveTransformSnap()}
		>{snapLabel}</button>
	</div>

	<div class="add-wrap">
		<button
			type="button"
			class:active={addMenuOpen}
			aria-haspopup="menu"
			aria-expanded={addMenuOpen}
			disabled={disabled}
			onclick={() => (addMenuOpen = !addMenuOpen)}
		>Add <span aria-hidden="true">▾</span></button>
		{#if addMenuOpen}
			<div class="add-menu" role="menu" aria-label="Add to scene">
				<button
					type="button"
					role="menuitem"
					disabled={!canAddCamera}
					onclick={addCamera}
				>Camera</button>
				{#if !canAddCamera}
					<p>Finish or cancel current interaction first.</p>
				{/if}
			</div>
		{/if}
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

	.add-wrap { position: relative; }
	.add-menu {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		min-width: 12.5rem;
		padding: 0.35rem;
		border: 1px solid #44414b;
		border-radius: 0.4rem;
		background: #17171f;
		box-shadow: 0 0.7rem 1.5rem rgb(0 0 0 / 38%);
	}
	.add-menu button { width: 100%; text-align: left; padding: 0.5rem 0.55rem; }
	.add-menu p {
		margin: 0.35rem 0.55rem 0.3rem;
		color: #8f8a82;
		font: 0.64rem/1.35 ui-sans-serif, system-ui, sans-serif;
	}
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
		.add-wrap { margin-left: auto; }
		.add-menu { right: 0; max-width: calc(100vw - 1.6rem); }
	}
</style>
