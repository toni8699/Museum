<script lang="ts">
	import { Box, Play, Redo2, Route, Undo2 } from 'lucide-svelte';
	import EditorProjectMenu from '$lib/editor/EditorProjectMenu.svelte';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import type { Editor3dContext, EditorViewState } from './editor-view-state.svelte';
	import type { EditorViewMode } from './editor-view-mode';

	let {
		store,
		layoutPreview,
		viewState,
		confirmSceneReplacement,
		confirmLayoutReplacement,
		projectName,
		onReset
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		viewState: EditorViewState;
		confirmSceneReplacement: () => boolean;
		confirmLayoutReplacement: () => boolean;
		projectName: string;
		/** H1 S3 — fired after the Project-menu reset actions; the shell clears the active selection. */
		onReset?: () => void;
	} = $props();

	const viewMode = $derived(viewState.viewMode);
	const active3dContext = $derived(viewState.active3dContext);
	const canSwitch = $derived(!store.isDocumentMutationBlocked && !store.isEditorInteractionActive);
	const dirty = $derived(store.isDirty);
	const canPreviewTour = $derived(
		!store.isEditorInteractionActive &&
		!store.isDocumentTransactionActive &&
		store.canStartTourPreview &&
		(!store.cameraPreview || store.cameraPreview.transport !== 'playing')
	);
	let projectMenuOpen = $state(false);

	function switchView(mode: EditorViewMode) {
		if (!canSwitch) {
			store.setStatusMessage('Stop the current interaction before switching views');
			return;
		}
		viewState.setViewMode(mode);
	}

	function switchContext(context: Editor3dContext) {
		if (!canSwitch) {
			store.setStatusMessage('Stop the current interaction before switching contexts');
			return;
		}
		viewState.set3dContext(context);
	}
</script>

<header class="app-bar" aria-label="Museum editor shell" style="grid-area: top;">
	<div class="brand">
		<span class="title">Museum editor</span>
		<span class="subtitle">{projectName}</span>
	</div>

	<div class="views" role="tablist" aria-label="Editor views">
		<button
			type="button"
			role="tab"
			aria-selected={viewMode === 'plan'}
			class:active={viewMode === 'plan'}
			disabled={!canSwitch}
			onclick={() => switchView('plan')}
		>Plan</button>
		<button
			type="button"
			role="tab"
			aria-selected={viewMode === '3d'}
			class:active={viewMode === '3d'}
			disabled={!canSwitch}
			onclick={() => switchView('3d')}
		>3D</button>
	</div>

	{#if viewMode === '3d'}
		<div class="contexts" role="tablist" aria-label="3D context">
			<button
				type="button"
				role="tab"
				aria-selected={active3dContext === 'scene'}
				class:active={active3dContext === 'scene'}
				disabled={!canSwitch}
				onclick={() => switchContext('scene')}
			><Box size={13} aria-hidden="true" /> Scene</button>
			<button
				type="button"
				role="tab"
				aria-selected={active3dContext === 'camera'}
				class:active={active3dContext === 'camera'}
				disabled={!canSwitch}
				onclick={() => switchContext('camera')}
			><Route size={13} aria-hidden="true" /> Camera</button>
		</div>
	{/if}

	<div class="actions">
		<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
		<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}><Undo2 size={14} aria-hidden="true" /> Undo</button>
		<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}><Redo2 size={14} aria-hidden="true" /> Redo</button>
		{#if viewMode === '3d' && active3dContext === 'scene'}
			<a class="preview-action" href="/museum" target="_blank" rel="noreferrer">Preview Museum</a>
		{:else if viewMode === '3d' && active3dContext === 'camera'}
			<!-- S10.1 — Place Camera moved into the Camera viewport toolbar
			     (Select | Move | Rotate | Add camera | View); the app bar keeps
			     the high-level playback action only. -->
			<button
				type="button"
				disabled={!canPreviewTour}
				title="Preview the camera flow"
				onclick={() => store.previewGuidedTour()}
				><Play size={14} aria-hidden="true" /> Preview Flow</button>
		{/if}
		<EditorProjectMenu
			{store}
			{layoutPreview}
			{confirmSceneReplacement}
			{confirmLayoutReplacement}
			{onReset}
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
		border-bottom: 1px solid #2a2a33;
		background: #13131a;
	}
	.brand { display: flex; flex-direction: column; gap: 0.05rem; min-width: 12.5rem; }
	.title { font-size: 0.92rem; font-weight: 650; letter-spacing: 0.02em; color: #f4efe4; }
	.subtitle { color: #8f8a82; font-size: 0.68rem; }
	.views, .contexts {
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
		background: #16161d;
	}
	.views button, .contexts button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 0.32rem;
		background: transparent;
		color: #a8a29a;
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.views button:disabled, .contexts button:disabled { opacity: 0.5; cursor: default; }
	.views button:hover:not(:disabled), .contexts button:hover:not(:disabled) { color: #f4efe4; }
	.views button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.contexts button.active { border-color: #52634e; background: #182218; color: #cfe9c4; }
	.actions { display: flex; gap: 0.4rem; align-items: center; margin-left: auto; }
	.document-state {
		padding: 0.16rem 0.42rem;
		border: 1px solid #52634e;
		border-radius: 999px;
		background: #182218;
		color: #cfe9c4;
		font-size: 0.62rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.document-state.dirty { border-color: #8d753c; background: #2a2618; color: #f4dc9b; }
	.actions button,
	.preview-action {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.36rem 0.6rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
	}
	.actions button:disabled { opacity: 0.4; cursor: default; }
	.actions button:hover:not(:disabled),
	.preview-action:hover { border-color: #d6b35f; }

	@media (max-width: 62rem) {
		.app-bar { flex-wrap: wrap; gap: 0.55rem 0.75rem; }
		.brand { min-width: 0; flex: 1 1 10rem; }
		.views, .contexts { order: 2; }
		.actions { order: 3; width: 100%; margin-left: 0; overflow-x: auto; padding-bottom: 0.05rem; }
		.actions > .document-state { margin-right: auto; }
	}
	@media (max-width: 34rem) {
		.app-bar { padding: 0.5rem 0.6rem; }
		.subtitle { display: none; }
		.views, .contexts { margin-left: auto; }
		.views button, .contexts button { padding-inline: 0.62rem; }
		.actions button, .preview-action { padding-inline: 0.5rem; }
	}
</style>
