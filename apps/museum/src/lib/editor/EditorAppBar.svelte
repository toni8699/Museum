<script lang="ts">
	import { parseSceneDocumentJson } from '$lib/content/scene-codec';
	import { onMount } from 'svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		confirmDiscardUnsavedChanges
	}: {
		store: MuseumEditorStore;
		confirmDiscardUnsavedChanges: () => boolean;
	} = $props();

	const workspace = $derived(store.currentWorkspace);
	const canSwitchWorkspace = $derived(
		!store.isDocumentMutationBlocked && !store.isEditorInteractionActive
	);
	const dirty = $derived(store.isDirty);
	const projectMutationBlocked = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	const canPreviewTour = $derived(
		!store.isEditorInteractionActive &&
		!store.isDocumentTransactionActive &&
		(!store.cameraPreview || store.cameraPreview.transport !== 'playing')
	);
	let projectMenuOpen = $state(false);
	let projectMenuElement = $state<HTMLElement>();
	let importFileInput = $state<HTMLInputElement>();
	let pastedSceneJson = $state('');

	function switchWorkspace(next: 'scene' | 'camera') {
		if (store.setWorkspace(next)) return;
		store.setStatusMessage('Stop the current interaction before switching workspaces');
	}

	function importSceneJson(json: string, clearPasteOnSuccess = false) {
		const parsed = parseSceneDocumentJson(json);
		if (!parsed.success) {
			store.setStatusMessage(`Import failed: ${parsed.issues[0]?.message ?? 'Invalid scene document'}`);
			return false;
		}
		if (!confirmDiscardUnsavedChanges()) return false;
		if (!store.importDocument(parsed.document)) return false;
		if (clearPasteOnSuccess) pastedSceneJson = '';
		store.setStatusMessage('Imported scene document');
		return true;
	}

	async function onImportFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			importSceneJson(await file.text());
		} catch {
			store.setStatusMessage('Import failed: Could not read the selected file');
		}
	}

	async function copySceneJson() {
		const json = store.canonicalJson;
		if (!json) return;
		if (!navigator.clipboard?.writeText) {
			store.setStatusMessage('Copy failed: Clipboard API is unavailable');
			return;
		}
		try {
			await navigator.clipboard.writeText(json);
			store.setStatusMessage('Copied canonical scene JSON');
		} catch {
			store.setStatusMessage('Copy failed: Clipboard permission was denied');
		}
	}

	function downloadSceneJson() {
		const json = store.canonicalJson;
		if (!json) return;
		const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'museum-scene.json';
		anchor.style.display = 'none';
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 0);
		store.setStatusMessage('Downloaded canonical scene JSON');
	}

	function resetScene() {
		if (!confirmDiscardUnsavedChanges()) return;
		if (store.resetToCheckedInDocument()) store.setStatusMessage('Reset to checked-in scene');
	}

	onMount(() => {
		const closeProjectMenu = (event: PointerEvent) => {
			if (!projectMenuElement?.contains(event.target as Node)) projectMenuOpen = false;
		};
		const closeProjectMenuWithEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') projectMenuOpen = false;
		};
		window.addEventListener('pointerdown', closeProjectMenu);
		window.addEventListener('keydown', closeProjectMenuWithEscape);
		return () => {
			window.removeEventListener('pointerdown', closeProjectMenu);
			window.removeEventListener('keydown', closeProjectMenuWithEscape);
		};
	});
</script>

<header class="app-bar" aria-label="Museum editor shell" style="grid-area: top;">
	<div class="brand">
		<span class="title">Museum editor</span>
		<span class="subtitle">museum-scene.json</span>
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
	</div>
	<div class="actions">
		<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
		<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}>Undo</button>
		<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}>Redo</button>
		{#if workspace === 'scene'}
			<a class="preview-action" href="/museum" target="_blank" rel="noreferrer">Preview Museum</a>
		{:else}
			<button
				type="button"
				disabled={!canPreviewTour}
				title="Preview one complete guided loop"
				onclick={() => store.previewGuidedTour()}
			>Preview Tour</button>
		{/if}
		<div bind:this={projectMenuElement} class="project-menu-wrap">
			<button
				type="button"
				class:active={projectMenuOpen}
				aria-haspopup="dialog"
				aria-expanded={projectMenuOpen}
				onclick={() => (projectMenuOpen = !projectMenuOpen)}
			>Project <span aria-hidden="true">▾</span></button>
			{#if projectMenuOpen}
				<div class="project-menu" role="dialog" aria-label="Project actions">
					<div class="project-heading">
						<div>
							<strong>Scene JSON</strong>
							<span>Copy and download keep this session unsaved.</span>
						</div>
						<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
					</div>
					<input bind:this={importFileInput} class="visually-hidden" type="file" accept="application/json,.json" onchange={onImportFileChange} />
					<div class="project-actions">
						<button type="button" disabled={projectMutationBlocked} onclick={() => importFileInput?.click()}>Import file</button>
						<button type="button" disabled={!store.canExport} onclick={copySceneJson}>Copy JSON</button>
						<button type="button" disabled={!store.canExport} onclick={downloadSceneJson}>Download JSON</button>
						<button type="button" class="danger" disabled={projectMutationBlocked} onclick={resetScene}>Reset</button>
					</div>
					<label class="paste-import">
						<span>Paste scene JSON</span>
						<textarea bind:value={pastedSceneJson} spellcheck="false" placeholder={'{ ... }'}></textarea>
					</label>
					<button class="paste-action" type="button" disabled={projectMutationBlocked || !pastedSceneJson.trim()} onclick={() => importSceneJson(pastedSceneJson, true)}>Import pasted JSON</button>
					{#if store.validationIssues.length > 0}
						<div class="validation-errors" role="alert">
							<strong>{store.validationIssues.length} validation error{store.validationIssues.length === 1 ? '' : 's'}</strong>
							<ul>
								{#each store.validationIssues as issue (`${issue.path}:${issue.code}`)}
									<li><code>{issue.path}</code> — {issue.message}</li>
								{/each}
							</ul>
						</div>
					{:else}
						<p class="validation-ok">Scene document is valid.</p>
					{/if}
					{#if store.statusMessage}<p class="status" role="status">{store.statusMessage}</p>{/if}
				</div>
			{/if}
		</div>
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
	.workspaces {
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
		background: #16161d;
	}
	.workspaces button {
		padding: 0.4rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 0.32rem;
		background: transparent;
		color: #a8a29a;
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.workspaces button:disabled { opacity: 0.5; cursor: default; }
	.workspaces button:hover:not(:disabled) { color: #f4efe4; }
	.workspaces button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
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
	.actions button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
	.project-menu-wrap { position: relative; }
	.project-menu {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		z-index: 20;
		width: min(25rem, calc(100vw - 1.8rem));
		box-sizing: border-box;
		padding: 0.75rem;
		border: 1px solid #44414b;
		border-radius: 0.45rem;
		background: #17171f;
		box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 48%);
	}
	.project-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.7rem; }
	.project-heading > div { display: flex; min-width: 0; flex-direction: column; gap: 0.15rem; }
	.project-heading strong { font-size: 0.8rem; }
	.project-heading span:not(.document-state) { color: #8f8a82; font-size: 0.65rem; line-height: 1.35; }
	.project-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; margin-top: 0.7rem; }
	.project-actions button { width: 100%; }
	.project-actions .danger { border-color: #684147; background: #21191b; color: #efc7c7; }
	.paste-import { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.7rem; color: #d6d0c4; font-size: 0.68rem; }
	.paste-import textarea { min-height: 4.5rem; resize: vertical; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #101016; color: #f4efe4; font: 0.68rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
	.paste-action { width: 100%; margin-top: 0.4rem; }
	.validation-errors { max-height: 8rem; overflow: auto; margin-top: 0.65rem; padding: 0.55rem; border: 1px solid #684147; border-radius: 0.35rem; background: #21191b; color: #efc7c7; font-size: 0.68rem; line-height: 1.4; }
	.validation-errors ul { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.35rem 0 0; padding-left: 1.1rem; }
	.validation-errors code { color: #f4dc9b; font-size: 0.64rem; }
	.validation-ok, .status { margin: 0.55rem 0 0; color: #a8a29a; font-size: 0.68rem; line-height: 1.4; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }

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
		.project-menu {
			position: fixed;
			top: 5.75rem;
			left: 0.6rem;
			right: 0.6rem;
			width: auto;
			max-height: calc(100dvh - 6.35rem);
			overflow: auto;
		}
	}
</style>
