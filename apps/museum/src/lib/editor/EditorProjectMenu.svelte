<script lang="ts">
	import { parseSceneDocumentJson } from '$lib/content/scene-codec';
	import { onMount } from 'svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		confirmDiscardUnsavedChanges,
		open = $bindable(false)
	}: {
		store: MuseumEditorStore;
		confirmDiscardUnsavedChanges: () => boolean;
		open?: boolean;
	} = $props();

	const dirty = $derived(store.isDirty);
	const projectMutationBlocked = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	let projectMenuElement = $state<HTMLElement>();
	let importFileInput = $state<HTMLInputElement>();
	let pastedSceneJson = $state('');

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
			if (!projectMenuElement?.contains(event.target as Node)) open = false;
		};
		const closeProjectMenuWithEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') open = false;
		};
		window.addEventListener('pointerdown', closeProjectMenu);
		window.addEventListener('keydown', closeProjectMenuWithEscape);
		return () => {
			window.removeEventListener('pointerdown', closeProjectMenu);
			window.removeEventListener('keydown', closeProjectMenuWithEscape);
		};
	});
</script>

<div bind:this={projectMenuElement} class="project-menu-wrap">
	<button
		type="button"
		class:active={open}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>Project <span aria-hidden="true">▾</span></button>
	{#if open}
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

<style>
	.project-menu-wrap { position: relative; }
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
	.project-menu-wrap > button {
		padding: 0.36rem 0.6rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.project-menu-wrap > button:hover { border-color: #d6b35f; }
	.project-menu-wrap > button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
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
	.project-actions button {
		width: 100%;
		padding: 0.36rem 0.6rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.project-actions button:disabled { opacity: 0.4; cursor: default; }
	.project-actions button:hover:not(:disabled) { border-color: #d6b35f; }
	.project-actions .danger { border-color: #684147; background: #21191b; color: #efc7c7; }
	.paste-import { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.7rem; color: #d6d0c4; font-size: 0.68rem; }
	.paste-import textarea { min-height: 4.5rem; resize: vertical; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #101016; color: #f4efe4; font: 0.68rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
	.paste-action {
		width: 100%;
		margin-top: 0.4rem;
		padding: 0.36rem 0.6rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.paste-action:disabled { opacity: 0.4; cursor: default; }
	.paste-action:hover:not(:disabled) { border-color: #d6b35f; }
	.validation-errors { max-height: 8rem; overflow: auto; margin-top: 0.65rem; padding: 0.55rem; border: 1px solid #684147; border-radius: 0.35rem; background: #21191b; color: #efc7c7; font-size: 0.68rem; line-height: 1.4; }
	.validation-errors ul { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.35rem 0 0; padding-left: 1.1rem; }
	.validation-errors code { color: #f4dc9b; font-size: 0.64rem; }
	.validation-ok, .status { margin: 0.55rem 0 0; color: #a8a29a; font-size: 0.68rem; line-height: 1.4; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }

	@media (max-width: 34rem) {
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
