<script lang="ts">
	import { Box, Redo2, Route, Undo2 } from 'lucide-svelte';
	import EditorProjectMenu from '$lib/editor/EditorProjectMenu.svelte';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import type { EditorDomain, EditorViewState } from './editor-view-state.svelte';
	import type { EditorViewMode } from './editor-view-mode';
	import type { ProjectSummary } from '$lib/editor/project-persistence';

	let {
		store,
		layoutPreview,
		viewState,
		confirmSceneReplacement,
		confirmLayoutReplacement,
		projectName = 'Untitled project',
		projectIsDirty,
		onProjectNameChange,
		onSaveProject,
		onLoadProject,
		onRefreshProjects,
		onSignIn,
		onSignOut,
		sessionStatus = 'unauthenticated',
		ownedProjects = [],
		cloudStatus = 'disabled',
		cloudError = null,
		saveAuthGateOpen = false,
		onContinueSaveAuth,
		onCancelSaveAuth,
		pendingSaveActive = false,
		onDiscardPendingSave,
		onReset
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		viewState: EditorViewState;
		confirmSceneReplacement: () => boolean;
		confirmLayoutReplacement: () => boolean;
		projectName?: string;
		projectIsDirty?: boolean;
		onProjectNameChange?: (name: string) => void;
		onSaveProject?: () => void;
		onLoadProject?: (projectId: string) => void;
		onRefreshProjects?: () => void;
		onSignIn?: () => void | Promise<void>;
		onSignOut?: () => void | Promise<void>;
		sessionStatus?: 'checking' | 'authenticated' | 'unauthenticated' | 'error';
		ownedProjects?: readonly ProjectSummary[];
		cloudStatus?: 'disabled' | 'ready' | 'loading' | 'saving' | 'error';
		cloudError?: string | null;
		saveAuthGateOpen?: boolean;
		onContinueSaveAuth?: () => void | Promise<void>;
		onCancelSaveAuth?: () => void;
		pendingSaveActive?: boolean;
		onDiscardPendingSave?: () => void;
		/** fired after the Project-menu reset actions; the shell clears the active selection. */
		onReset?: () => void;
	} = $props();

	const domain = $derived(viewState.domain);
	const activeView = $derived(viewState.activeView);
	// P11.2 §3 — CH·AA: domain/view switching is chrome and stays enabled under a
	// playing Director preview (leaving the camera workspace stops it via the
	// existing setWorkspace teardown); only an active gesture blocks.
	const canSwitch = $derived(!store.isEditorInteractionActive);
	const dirty = $derived(projectIsDirty ?? store.isDirty);
	let projectMenuOpen = $state(false);

	// P1.1 — two always-visible segmented controls: the domain switcher is
	// primary (`Scene | Camera`), the view switcher is per-domain in fixed
	// `[Plan | 3D]` order everywhere (§A / §C §5.1). The `canSwitch` guard
	// applies to both.
	function switchDomain(next: EditorDomain) {
		if (!canSwitch) {
			store.setStatusMessage('Stop the current interaction before switching domains');
			return;
		}
		viewState.setDomain(next);
	}

	function switchView(mode: EditorViewMode) {
		if (!canSwitch) {
			store.setStatusMessage('Stop the current interaction before switching views');
			return;
		}
		viewState.setView(domain, mode);
	}
</script>

<header class="app-bar" aria-label="Editor shell" style="grid-area: top;">
	<div class="brand">
		<span class="title">Museum editor</span>
		<span class="subtitle">{projectName}</span>
	</div>

	<div class="domains" role="tablist" aria-label="Editor domain">
		<button
			type="button"
			role="tab"
			aria-selected={domain === 'scene'}
			class:active={domain === 'scene'}
			disabled={!canSwitch}
			onclick={() => switchDomain('scene')}
		><Box size={13} aria-hidden="true" /> Scene</button>
		<button
			type="button"
			role="tab"
			aria-selected={domain === 'camera'}
			class:active={domain === 'camera'}
			disabled={!canSwitch}
			onclick={() => switchDomain('camera')}
		><Route size={13} aria-hidden="true" /> Camera</button>
	</div>

	<div class="views" role="tablist" aria-label="Editor views">
		<button
			type="button"
			role="tab"
			aria-selected={activeView === 'plan'}
			class:active={activeView === 'plan'}
			disabled={!canSwitch}
			onclick={() => switchView('plan')}
		>Plan</button>
		<button
			type="button"
			role="tab"
			aria-selected={activeView === '3d'}
			class:active={activeView === '3d'}
			disabled={!canSwitch}
			onclick={() => switchView('3d')}
		>3D</button>
	</div>

	<div class="actions">
		<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
		<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}><Undo2 size={14} aria-hidden="true" /> Undo</button>
		<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}><Redo2 size={14} aria-hidden="true" /> Redo</button>
		{#if domain === 'scene' && activeView === '3d'}
			<a class="preview-action" href="/museum" target="_blank" rel="noreferrer">Preview Museum</a>
		{/if}
		<EditorProjectMenu
			{store}
			{layoutPreview}
			{confirmSceneReplacement}
			{confirmLayoutReplacement}
			{projectName}
			{projectIsDirty}
			{onProjectNameChange}
			{onSaveProject}
			{onLoadProject}
			{onRefreshProjects}
			{onSignIn}
			{onSignOut}
			{sessionStatus}
			{ownedProjects}
			{cloudStatus}
			{cloudError}
			{saveAuthGateOpen}
			{onContinueSaveAuth}
			{onCancelSaveAuth}
			{pendingSaveActive}
			{onDiscardPendingSave}
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
		border-bottom: 1px solid var(--editor-border-subtle);
		background: var(--editor-bg-panel);
	}
	.brand { display: flex; flex-direction: column; gap: 0.05rem; min-width: 12.5rem; }
	.title { font-size: 0.92rem; font-weight: 650; letter-spacing: 0.02em; color: var(--editor-text-primary); }
	.subtitle { color: var(--editor-text-muted); font-size: 0.68rem; }
	.domains, .views {
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		border: 1px solid var(--editor-border-subtle);
		border-radius: 0.4rem;
		background: var(--editor-bg-panel);
	}
	.domains button, .views button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 0.32rem;
		background: transparent;
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.domains button:disabled, .views button:disabled { opacity: 0.5; cursor: default; }
	.domains button:hover:not(:disabled), .views button:hover:not(:disabled) { color: var(--editor-text-primary); }
	.domains button.active, .views button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
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
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
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
		.domains, .views { order: 2; }
		.actions { order: 3; width: 100%; margin-left: 0; overflow-x: auto; padding-bottom: 0.05rem; }
		.actions > .document-state { margin-right: auto; }
	}
	@media (max-width: 34rem) {
		.app-bar { padding: 0.5rem 0.6rem; }
		.subtitle { display: none; }
		.domains, .views { margin-left: auto; }
		.domains button, .views button { padding-inline: 0.62rem; }
		.actions button, .preview-action { padding-inline: 0.5rem; }
	}
</style>
