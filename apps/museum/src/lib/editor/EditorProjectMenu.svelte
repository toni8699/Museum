<script lang="ts">
	import { parseSceneDocumentJson } from '$lib/content/scene-codec';
	import { parseLayoutDocumentJson } from '$lib/layout/layout-codec';
	import {
		importLayoutPreviewJson,
		layoutPreviewCanonicalJson,
		layoutPreviewIsDirty,
		layoutPreviewStatusLabel,
		resetLayoutPreview,
		setLayoutPreviewImportError,
		type LayoutPreviewState
	} from './layout/layout-preview-state.svelte';
	import { onMount } from 'svelte';
	import { acquireObjectUrl, releaseObjectUrl } from './store/binary-texture-store.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		layoutPreview,
		confirmSceneReplacement,
		confirmLayoutReplacement,
		relic = false,
		open = $bindable(false)
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		confirmSceneReplacement: () => boolean;
		confirmLayoutReplacement: () => boolean;
		relic?: boolean;
		open?: boolean;
	} = $props();

	const dirty = $derived(store.isDirty);
	const projectMutationBlocked = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	const exportBlocker = $derived(store.projectExportBlocker);
	const unresolvedCount = $derived(store.unresolvedTextureCount);
	const plainJsonBlocked = $derived(exportBlocker !== null);
	let projectMenuElement = $state<HTMLElement>();
	let importFileInput = $state<HTMLInputElement>();
	let layoutImportFileInput = $state<HTMLInputElement>();
	let packageImportInput = $state<HTMLInputElement>();
	let pastedSceneJson = $state('');
	let pastedLayoutJson = $state('');
	let exportInFlight = $state(false);

	function importSceneJson(json: string, clearPasteOnSuccess = false) {
		const parsed = parseSceneDocumentJson(json);
		if (!parsed.success) {
			store.setStatusMessage(`Import failed: ${parsed.issues[0]?.message ?? 'Invalid scene document'}`);
			return false;
		}
		if (!confirmSceneReplacement()) return false;
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

	function importLayoutJson(json: string, clearPasteOnSuccess = false) {
		const parsed = parseLayoutDocumentJson(json);
		if (!parsed.success) return importLayoutPreviewJson(layoutPreview, json);
		if (!confirmLayoutReplacement()) return false;
		const imported = importLayoutPreviewJson(layoutPreview, json);
		if (imported) store.clearSharedHistory();
		if (imported && clearPasteOnSuccess) pastedLayoutJson = '';
		return imported;
	}

	async function onLayoutImportFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			importLayoutJson(await file.text());
		} catch {
			setLayoutPreviewImportError(layoutPreview, 'Could not read the selected file');
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

	async function copyLayoutJson() {
		const json = layoutPreviewCanonicalJson(layoutPreview);
		if (!navigator.clipboard?.writeText) {
			layoutPreview.statusMessage = 'Copy failed: Clipboard API is unavailable';
			return;
		}
		try {
			await navigator.clipboard.writeText(json);
			layoutPreview.statusMessage = 'Copied canonical layout JSON';
		} catch {
			layoutPreview.statusMessage = 'Copy failed: Clipboard permission was denied';
		}
	}

	function downloadLayoutJson() {
		try {
			const json = layoutPreviewCanonicalJson(layoutPreview);
			const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'museum-layout.json';
			anchor.style.display = 'none';
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
			layoutPreview.statusMessage = 'Downloaded canonical layout JSON';
		} catch {
			layoutPreview.statusMessage = 'Download failed: Could not serialize layout';
		}
	}

	function resetLayout() {
		if (!confirmLayoutReplacement()) return;
		resetLayoutPreview(layoutPreview);
		store.clearSharedHistory();
		layoutPreview.statusMessage = 'Reset to empty layout';
	}

	async function exportPackageArchive() {
		if (exportInFlight) return;
		exportInFlight = true;
		try {
			const result = await store.exportPackage();
			if (result.status !== 'ok') {
				store.setStatusMessage(`Export failed: ${result.detail}`);
				return;
			}
			const url = acquireObjectUrl(result.zip, 'application/zip');
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = result.filename;
			anchor.style.display = 'none';
			document.body.append(anchor);
			anchor.click();
			anchor.remove();
			// Belt-and-suspenders: re-release the URL after the browser has had
			// a tick to start the download. Older Chrome releases can lose the
			// reference if the GC runs first.
			window.setTimeout(() => releaseObjectUrl(url), 5_000);
			store.setStatusMessage(`Exported ${result.filename}`);
		} finally {
			exportInFlight = false;
		}
	}

	async function importPackageArchive(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!confirmSceneReplacement()) return;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const result = await store.importPackageArchive(bytes);
			if (result.status === 'rejected') {
				store.setStatusMessage(`Import failed: ${result.detail}`);
				return;
			}
			store.setStatusMessage('Imported package');
		} catch (err) {
			store.setStatusMessage(
				`Import failed: ${err instanceof Error ? err.message : 'Could not read the file'}`
			);
		}
	}

	function resetScene() {
		if (!confirmSceneReplacement()) return;
		if (store.resetToCheckedInDocument()) {
			store.setStatusMessage(relic ? 'Reset to checked-in scene' : 'Reset to empty project');
		}
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
			<input bind:this={layoutImportFileInput} class="visually-hidden" type="file" accept="application/json,.json" onchange={onLayoutImportFileChange} />
		<input
			bind:this={packageImportInput}
			class="visually-hidden"
			type="file"
			accept=".zip,.museumpack.zip,application/zip"
			onchange={importPackageArchive}
		/>
		<div class="project-actions">
			<button type="button" disabled={projectMutationBlocked} onclick={() => importFileInput?.click()}>Import file</button>
			<button type="button" disabled={projectMutationBlocked} onclick={() => packageImportInput?.click()}>Import package</button>
			<button
				type="button"
				class="primary"
				disabled={!store.canExport || exportInFlight}
				onclick={exportPackageArchive}
			>
				{exportInFlight ? 'Packaging…' : 'Export package…'}
			</button>
		</div>
		<div class="project-actions">
			<button
				type="button"
				disabled={plainJsonBlocked || !store.canExport}
				aria-describedby={plainJsonBlocked ? 'project-export-blocker-message' : undefined}
				onclick={copySceneJson}
			>Copy JSON</button>
			<button
				type="button"
				disabled={plainJsonBlocked || !store.canExport}
				aria-describedby={plainJsonBlocked ? 'project-export-blocker-message' : undefined}
				onclick={downloadSceneJson}
			>Download JSON</button>
			<button type="button" class="danger" disabled={projectMutationBlocked} onclick={resetScene}>Reset</button>
		</div>
		{#if plainJsonBlocked}
			<p id="project-export-blocker-message" class="blocker" role="status">
				<span class="blocker-dot" aria-hidden="true"></span>
				{unresolvedCount} unresolved texture{unresolvedCount === 1 ? '' : 's'} —
				<button type="button" class="link" onclick={exportPackageArchive} disabled={exportInFlight}>Export package to save</button>
			</p>
		{/if}
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
				{#if !relic}
					<section class="layout-json-section" aria-label="Layout JSON actions">
						<div class="project-heading">
							<div>
								<strong>Layout JSON</strong>
								<span>Independent editor-only layout document.</span>
							</div>
							<span class:dirty={layoutPreviewIsDirty(layoutPreview)} class="document-state">{layoutPreviewStatusLabel(layoutPreview)}</span>
						</div>
						<div class="project-actions">
							<button type="button" onclick={() => layoutImportFileInput?.click()}>Import file</button>
							<button type="button" onclick={copyLayoutJson}>Copy JSON</button>
							<button type="button" onclick={downloadLayoutJson}>Download JSON</button>
							<button type="button" class="danger" onclick={resetLayout}>Reset</button>
						</div>
						<label class="paste-import">
							<span>Paste layout JSON</span>
							<textarea bind:value={pastedLayoutJson} spellcheck="false" placeholder={'{ ... }'}></textarea>
						</label>
						<button class="paste-action" type="button" disabled={!pastedLayoutJson.trim()} onclick={() => importLayoutJson(pastedLayoutJson, true)}>Import pasted JSON</button>
						{#if layoutPreview.importError}<p class="layout-import-error" role="alert">Import failed: {layoutPreview.importError}</p>{/if}
						{#if layoutPreview.statusMessage}<p class="status" role="status">{layoutPreview.statusMessage}</p>{/if}
					</section>
				{/if}
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
		max-height: calc(100dvh - 5rem);
		overflow: auto;
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
	.project-actions .primary { border-color: #8d753c; background: #242018; color: #fff2c7; }
	.project-actions .primary:hover:not(:disabled) { background: #35301f; }
	.project-actions .danger { border-color: #684147; background: #21191b; color: #efc7c7; }
	.blocker {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.5rem 0 0;
		padding: 0.42rem 0.55rem;
		border: 1px solid #684147;
		border-radius: 0.32rem;
		background: #21191b;
		color: #efc7c7;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.blocker-dot { width: 0.42rem; height: 0.42rem; border-radius: 999px; background: #d96b6b; flex: 0 0 auto; }
	.blocker .link {
		padding: 0;
		border: none;
		background: transparent;
		color: #f4dc9b;
		font: inherit;
		font-size: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.blocker .link:hover:not(:disabled) { color: #fff2c7; }
	.blocker .link:disabled { opacity: 0.45; cursor: default; text-decoration: none; }
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
	.layout-json-section { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid #383640; }
	.layout-import-error { margin: 0.55rem 0 0; color: #efc7c7; font-size: 0.68rem; line-height: 1.4; }
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
