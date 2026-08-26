<script lang="ts">
	import type { EditorStore } from './editor-store.svelte';
	import type { EditorWorkspace } from './editor-types';
	import EditorProjectMenu from './EditorProjectMenu.svelte';

	let {
		store,
		layoutPreview,
		confirmSceneReplacement,
		confirmLayoutReplacement,
		relic = false
	}: {
		store: EditorStore;
		layoutPreview: import('./layout/layout-preview-state.svelte').LayoutPreviewState;
		confirmSceneReplacement: () => boolean;
		confirmLayoutReplacement: () => boolean;
		relic?: boolean;
	} = $props();

	const workspace = $derived(store.currentWorkspace);
	// P11.2 §3 — CH·AA: workspace switching is chrome and stays enabled under a
	// playing Director preview (leaving the camera workspace stops it via the
	// existing setWorkspace teardown); only an active gesture blocks.
	const canSwitchWorkspace = $derived(!store.isEditorInteractionActive);
	const dirty = $derived(store.isDirty);
	const sceneHistoryEnabled = $derived(true);
	const canPreviewTour = $derived(
		!store.isEditorInteractionActive &&
		!store.isDocumentTransactionActive &&
		store.canStartTourPreview &&
		(!store.cameraPreview || store.cameraPreview.transport !== 'playing')
	);
	let projectMenuOpen = $state(false);

	function switchWorkspace(next: EditorWorkspace) {
		if (store.setWorkspace(next)) return;
		store.setStatusMessage('Stop the current interaction before switching workspaces');
	}
</script>

<header class="app-bar" aria-label="Editor shell" style="grid-area: top;">
	<div class="brand">
		<span class="title">Museum editor</span>
		<span class="subtitle">scene.json</span>
	</div>
	<div class="workspaces" role="tablist" aria-label="Editor workspaces">
		<button
			type="button"
			role="tab"
			aria-selected={workspace === 'scene'}
			class:active={workspace === 'scene'}
			disabled={!canSwitchWorkspace}
			onclick={() => switchWorkspace('scene')}
		>Scene</button>
		<button
			type="button"
			role="tab"
			aria-selected={workspace === 'camera'}
			class:active={workspace === 'camera'}
			disabled={!canSwitchWorkspace}
			onclick={() => switchWorkspace('camera')}
		>Camera</button>
		{#if !relic}
			<button
				type="button"
				role="tab"
				aria-selected={workspace === 'layout'}
				class:active={workspace === 'layout'}
				disabled={!canSwitchWorkspace}
				onclick={() => switchWorkspace('layout')}
			>Layout</button>
		{/if}
	</div>
	<div class="actions">
		<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
		<button type="button" disabled={!sceneHistoryEnabled || !store.canUndo} onclick={() => store.undo()}>Undo</button>
		<button type="button" disabled={!sceneHistoryEnabled || !store.canRedo} onclick={() => store.redo()}>Redo</button>
		{#if workspace === 'scene'}
			<a class="preview-action" href="/museum" target="_blank" rel="noreferrer">Preview Museum</a>
		{:else if workspace === 'camera'}
			<button
				type="button"
				disabled={!canPreviewTour}
				title="Preview the camera sequence"
				onclick={() => store.previewSequence()}
				>Preview Sequence</button>
		{/if}
		<EditorProjectMenu
			{store}
			{layoutPreview}
			{confirmSceneReplacement}
			{confirmLayoutReplacement}
			{relic}
			bind:open={projectMenuOpen}
		/>
	</div>
</header>

<style>
	.app-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid var(--editor-border-subtle);
		background: var(--editor-bg-panel);
	}
	.brand { display: flex; flex-direction: column; gap: 0.05rem; min-width: 12.5rem; }
	.title { font-size: 0.92rem; font-weight: 650; letter-spacing: 0.02em; color: var(--editor-text-primary); }
	.subtitle { color: var(--editor-text-muted); font-size: 0.68rem; }
	.workspaces {
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		border: 1px solid var(--editor-border-subtle);
		border-radius: 0.4rem;
		background: var(--editor-bg-panel);
	}
	.workspaces button {
		padding: 0.4rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 0.32rem;
		background: transparent;
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.workspaces button:disabled { opacity: 0.5; cursor: default; }
	.workspaces button:hover:not(:disabled) { color: var(--editor-text-primary); }
	.workspaces button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.actions { display: flex; gap: 0.4rem; align-items: center; margin-left: auto; }
	.document-state {
		padding: 0.16rem 0.42rem;
		border: 1px solid var(--editor-success-border);
		border-radius: 999px;
		background: var(--editor-success-soft);
		color: var(--editor-success);
		font-size: 0.62rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.document-state.dirty { border-color: var(--editor-accent-border); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.actions button,
	.preview-action {
		padding: 0.36rem 0.6rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
	}
	.actions button:disabled { opacity: 0.4; cursor: default; }
	.actions button:hover:not(:disabled),
	.preview-action:hover { border-color: var(--editor-accent); }

	@media (max-width: 62rem) {
		.app-bar { flex-wrap: wrap; gap: 0.55rem 0.75rem; }
		.brand { min-width: 0; flex: 1 1 10rem; }
		.workspaces { order: 2; }
		.actions { order: 3; width: 100%; margin-left: 0; overflow-x: auto; padding-bottom: 0.05rem; }
		.actions > .document-state { margin-right: auto; }
	}
	@media (max-width: 34rem) {
		.app-bar { padding: 0.5rem 0.6rem; }
		.subtitle { display: none; }
		.workspaces { margin-left: auto; }
		.workspaces button { padding-inline: 0.62rem; }
		.actions button, .preview-action { padding-inline: 0.5rem; }
	}
</style>
