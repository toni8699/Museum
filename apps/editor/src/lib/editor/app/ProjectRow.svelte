<script lang="ts">
	import { ArrowLeft, Check, Palette, Play, Redo2, Undo2, UserRound } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { projectPersistencePresentation } from './project-persistence-presentation';
	import { setTheme, THEMES, themeState, type ThemeId } from '$lib/editor/theme.svelte';
	import EditorProjectMenu from '$lib/editor/EditorProjectMenu.svelte';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import type { ProjectSummary } from '$lib/editor/project-persistence';

	let {
		store,
		layoutPreview,
		currentProjectIsOwned = false,
		saveBlocker = null,
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
		resolveProjectAssetBytes,
		onReset,
		onPreview,
		previewDisabledReason = null
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		currentProjectIsOwned?: boolean;
		saveBlocker?: string | null;
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
		resolveProjectAssetBytes?: (uri: string) => Promise<Uint8Array | null>;
		/** fired after the Project-menu reset actions; the shell clears the active selection. */
		onReset?: () => void;
		onPreview?: () => void | Promise<void>;
		previewDisabledReason?: string | null;
	} = $props();

	const presentation = $derived(projectPersistencePresentation({
		owned: currentProjectIsOwned, dirty: projectIsDirty ?? store.isDirty,
		saving: cloudStatus === 'saving', blocker: saveBlocker
	}));
	let accountOpen = $state(false);
	// Surface the explicit save-auth interruption only. Background cloud
	// errors must never pop the menu open (they routinely fire on fresh
	// guest loads when the owned-projects refresh fails).
	$effect(() => { if (saveAuthGateOpen) projectMenuOpen = true; });
	function rename(input: HTMLInputElement) {
		const name = input.value.trim();
		if (name) onProjectNameChange?.(name);
		else input.value = projectName;
	}
	let projectMenuOpen = $state(false);
	let themeMenuOpen = $state(false);
	let themeMenuElement = $state<HTMLElement>();
	// Static registry snapshot: THEMES never changes at runtime, so the menu
	// picks up future themes automatically without reactive machinery.
	const themeEntries = Object.entries(THEMES) as Array<[ThemeId, (typeof THEMES)[ThemeId]]>;

	onMount(() => {
		const closeThemeMenu = (event: PointerEvent) => {
			if (!themeMenuElement?.contains(event.target as Node)) themeMenuOpen = false;
		};
		const closeThemeMenuWithEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') themeMenuOpen = false;
		};
		window.addEventListener('pointerdown', closeThemeMenu);
		window.addEventListener('keydown', closeThemeMenuWithEscape);
		return () => {
			window.removeEventListener('pointerdown', closeThemeMenu);
			window.removeEventListener('keydown', closeThemeMenuWithEscape);
		};
	});

</script>

<header class="project-row" aria-label="Project navigation" style="grid-area: top;">
	<a href="/projects" class="projects-link"><ArrowLeft size={14} /> Projects</a>
	<input class="project-name" aria-label="Project name" value={projectName} maxlength="200"
		onblur={(event) => rename(event.currentTarget)}
		onkeydown={(event) => {
			if (event.key === 'Enter') event.currentTarget.blur();
			if (event.key === 'Escape') { event.currentTarget.value = projectName; event.currentTarget.blur(); }
		}} />
	<span class="location">{presentation.location}</span>
	<button class="save-state" title={saveBlocker ?? presentation.hint}
		disabled={cloudStatus === 'saving' || cloudStatus === 'loading' || (!presentation.actionable && !saveBlocker)}
		onclick={() => { if (saveBlocker) projectMenuOpen = true; else if (presentation.actionable) onSaveProject?.(); }}
	>{presentation.label}</button>
	<!-- Document operations remain in the existing menu; identity/save/auth are elevated. -->
	<div class="document-menu-slot">
		<EditorProjectMenu
			elevated
			{saveBlocker}
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
			{resolveProjectAssetBytes}
			{onReset}
			bind:open={projectMenuOpen}
		/>
	</div>
	<nav aria-label="Project modes"><span aria-current="page">Spatial</span></nav>
	<div class="actions">
		<button type="button" aria-label="Undo" title="Undo" disabled={!store.canUndo} onclick={() => store.undo()}><Undo2 size={14} /></button>
		<button type="button" aria-label="Redo" title="Redo" disabled={!store.canRedo} onclick={() => store.redo()}><Redo2 size={14} /></button>
		<button
			class="preview-action"
			disabled={!onPreview}
			title={previewDisabledReason ?? 'Open Visitor Preview'}
			onclick={() => void onPreview?.()}
		><Play size={14} /> Preview</button>
		<div bind:this={themeMenuElement} class="theme-menu-wrap">
			<button
				type="button"
				class:active={themeMenuOpen}
				title="Theme"
				aria-label="Theme"
				aria-haspopup="menu"
				aria-expanded={themeMenuOpen}
				onclick={() => (themeMenuOpen = !themeMenuOpen)}
			><Palette size={14} aria-hidden="true" /></button>
			{#if themeMenuOpen}
				<div class="theme-menu" role="menu" aria-label="Editor theme">
					{#each themeEntries as [id, def] (id)}
						<button
							type="button"
							role="menuitemradio"
							aria-checked={themeState.current === id}
							class:active={themeState.current === id}
							onclick={() => {
								setTheme(id);
								themeMenuOpen = false;
							}}
						>
							<span>{def.label}</span>
							{#if themeState.current === id}<Check size={12} aria-hidden="true" />{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<div class="account">
			{#if sessionStatus === 'authenticated'}
				<button aria-label="Account" aria-expanded={accountOpen} onclick={() => accountOpen = !accountOpen}><UserRound size={16} /></button>
				{#if accountOpen}<div class="account-menu"><button onclick={onSignOut}>Sign out</button></div>{/if}
			{:else}
				<button disabled={!onSignIn || sessionStatus === 'checking'} onclick={onSignIn}>{sessionStatus === 'checking' ? 'Checking…' : 'Sign in'}</button>
			{/if}
		</div>
	</div>
</header>

<style>
	.project-row { display:flex; align-items:center; gap:8px; padding:0 8px; height:var(--editor-project-row-height); box-sizing:border-box; background:var(--editor-bg-row-1); border-bottom:1px solid var(--editor-border-subtle); font:500 12px var(--editor-font); min-width:0; z-index:30; }
	.project-row a { color:var(--editor-text-primary); text-decoration:none; display:flex; gap:6px; align-items:center; white-space:nowrap; }
	.project-name { width:180px; max-width:240px; min-width:80px; font:600 13px var(--editor-font); }
	button, input, .location, nav span { height:28px; box-sizing:border-box; border:1px solid var(--editor-border-subtle); border-radius:4px; background:transparent; color:var(--editor-text-primary); padding:0 8px; }
	.location, nav span { display:flex; align-items:center; white-space:nowrap; }
	button { display:inline-flex; align-items:center; justify-content:center; gap:5px; font:inherit; white-space:nowrap; cursor:pointer; }
	button:disabled { opacity:.5; cursor:default; }
	nav { margin-left:auto; margin-right:auto; }
	nav span { color:var(--editor-accent); background:var(--editor-bg-control); }
	.actions { display:flex; align-items:center; gap:4px; }
	.theme-menu-wrap, .account { position:relative; }
	.theme-menu, .account-menu { position:absolute; top:calc(100% + 4px); right:0; padding:5px; min-width:130px; background:var(--editor-bg-panel-raised); border:1px solid var(--editor-border-normal); border-radius:4px; box-shadow:var(--editor-shadow-popover); }
	.theme-menu button { width:100%; justify-content:space-between; }
	.theme-menu button.active { color:var(--editor-accent); }
	@media(max-width:1100px) { .project-name { width:120px; } .project-row { gap:4px; } }
</style>
