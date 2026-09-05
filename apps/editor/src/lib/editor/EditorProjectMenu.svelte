<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
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
	import type { EditorStore } from './editor-store.svelte';
	import type { ProjectSummary } from './project-persistence';

	let {
		store,
		layoutPreview,
		confirmSceneReplacement,
		confirmLayoutReplacement,
		relic = false,
		elevated = false,
		saveBlocker = null,
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
		open = $bindable(false),
		onReset
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		confirmSceneReplacement: () => boolean;
		confirmLayoutReplacement: () => boolean;
		relic?: boolean;
		elevated?: boolean;
		saveBlocker?: string | null;
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
		open?: boolean;
		/** fired after a reset action; the shell clears the active selection on all three slots. */
		onReset?: () => void;
	} = $props();

	const dirty = $derived(projectIsDirty ?? (store.isDirty || layoutPreviewIsDirty(layoutPreview)));
	const cloudConfigured = $derived(cloudStatus !== 'disabled' && onSaveProject !== undefined);
	const cloudBusy = $derived(cloudStatus === 'loading' || cloudStatus === 'saving');
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
		anchor.download = 'scene.json';
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
			anchor.download = 'layout.json';
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
		onReset?.();
	}

	async function exportPackageArchive() {
		if (exportInFlight) return;
		exportInFlight = true;
		try {
			const result = await store.exportPackage({
				resolveBytesByUri: resolveProjectAssetBytes
			});
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
			onReset?.();
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

<div bind:this={projectMenuElement} class="project-menu-wrap" class:elevated>
	<button
		type="button"
		class:active={open}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => (open = !open)}
	aria-label={elevated ? "Document menu" : "Project"}
	>{#if elevated}⋮{:else}Project <ChevronDown size={14} aria-hidden="true" />{/if}</button>
	{#if open}
		<div class="project-menu" role="dialog" aria-label="Project actions">
			{#if saveBlocker}<p role="status">{saveBlocker}</p>{/if}
			{#if !relic && cloudConfigured}
				<section class="cloud-project" aria-label="Cloud project">
					<div class="project-heading">
						<div>
							<strong>Cloud project</strong>
							<span>Save and load your owned semantic project.</span>
						</div>
						<span class:dirty={dirty} class="document-state">
							{cloudStatus === 'saving' ? 'Saving' : cloudStatus === 'loading' ? 'Loading' : dirty ? 'Unsaved' : 'Saved'}
						</span>
					</div>
					{#if !elevated}
					<label class="project-name-field">
						<span>Project name</span>
						<input
							value={projectName}
							oninput={(event) => onProjectNameChange?.((event.currentTarget as HTMLInputElement).value)}
							maxlength="200"
						/>
					</label>
					<div class="project-actions">
						<button type="button" class="primary" disabled={!cloudConfigured || cloudBusy} onclick={onSaveProject}>
							{cloudStatus === 'saving' ? 'Saving…' : pendingSaveActive ? 'Retry save' : 'Save cloud project'}
						</button>
						{#if sessionStatus === 'authenticated'}
							<button type="button" disabled={cloudBusy} onclick={onSignOut}>Sign out</button>
						{:else if onSignIn}
							<button type="button" disabled={cloudBusy || sessionStatus === 'checking'} onclick={onSignIn}>
								{sessionStatus === 'checking' ? 'Checking…' : 'Sign in'}
							</button>
						{/if}
					</div>
					{/if}
					{#if saveAuthGateOpen}
						<div class="save-auth-gate" role="alertdialog" aria-modal="true" aria-labelledby="save-auth-title">
							<strong id="save-auth-title">Save your project</strong>
							<p>Sign in with Google to save this project and access it later.</p>
							<div class="project-actions">
								<button type="button" class="primary" onclick={onContinueSaveAuth}>Continue with Google</button>
								<button type="button" onclick={onCancelSaveAuth}>Not now</button>
							</div>
						</div>
					{/if}
					{#if pendingSaveActive}
						<button type="button" class="discard-draft" onclick={onDiscardPendingSave}>Discard draft</button>
					{/if}
					<div class="cloud-project-heading">
						<strong>Owned projects</strong>
						<button type="button" class="text-button" disabled={!cloudConfigured || cloudBusy} onclick={onRefreshProjects}>Refresh</button>
					</div>
					{#if sessionStatus !== 'authenticated'}
						<p class="empty-projects">Sign in to view saved projects.</p>
					{:else if ownedProjects.length === 0}
						<p class="empty-projects">No saved projects.</p>
					{:else}
						<ul class="owned-projects">
							{#each ownedProjects as project (project.id)}
								<li>
									<span><strong>{project.name}</strong><small>v{project.version}</small></span>
									<button type="button" disabled={!cloudConfigured || cloudBusy} onclick={() => onLoadProject?.(project.id)}>Load</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if cloudError}<p class="cloud-error" role="alert">{cloudError}</p>{/if}
				</section>
			{/if}
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
			accept=".zip,.scenepack.zip,application/zip"
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
	.project-menu-wrap > button {
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
		white-space: nowrap;
	}
	.project-menu-wrap > button:hover { border-color: var(--editor-accent); }
	.project-menu-wrap > button.active { border-color: var(--editor-accent-border); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.project-menu {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		z-index: 20;
		width: min(25rem, calc(100vw - 1.8rem));
		box-sizing: border-box;
		padding: 0.75rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.45rem;
		background: var(--editor-bg-panel-raised);
		box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 48%);
		max-height: calc(100dvh - 5rem);
		overflow: auto;
	}
	.project-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.7rem; }
	.project-heading > div { display: flex; min-width: 0; flex-direction: column; gap: 0.15rem; }
	.project-heading strong { font-size: 0.8rem; }
	.project-heading span:not(.document-state) { color: var(--editor-text-muted); font-size: 0.65rem; line-height: 1.35; }
	.cloud-project { margin-bottom: 0.8rem; padding-bottom: 0.8rem; border-bottom: 1px solid var(--editor-border-subtle); }
	.project-name-field { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.65rem; color: var(--editor-text-secondary); font-size: 0.68rem; }
	.project-name-field input { min-width: 0; padding: 0.38rem 0.45rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel); color: var(--editor-text-primary); font: inherit; font-size: 0.72rem; }
	.cloud-project-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 0.8rem; color: var(--editor-text-secondary); font-size: 0.68rem; }
	.save-auth-gate { margin-top: 0.7rem; padding: 0.65rem; border: 1px solid var(--editor-accent-border); border-radius: 0.35rem; background: var(--editor-bg-selected); }
	.save-auth-gate p { margin: 0.35rem 0 0; color: var(--editor-text-secondary); font-size: 0.68rem; line-height: 1.4; }
	.save-auth-gate .project-actions { margin-top: 0.55rem; }
	.discard-draft { width: 100%; margin-top: 0.45rem; padding: 0.3rem 0.5rem; border: 1px solid var(--editor-danger-border); border-radius: 0.25rem; background: var(--editor-danger-soft); color: var(--editor-danger-fg); font: inherit; font-size: 0.68rem; cursor: pointer; }
	.discard-draft:hover { border-color: var(--editor-danger); }
	.text-button { padding: 0; border: 0; background: transparent; color: var(--editor-text-primary); font: inherit; font-size: 0.68rem; text-decoration: underline; cursor: pointer; }
	.text-button:disabled { opacity: 0.4; cursor: default; }
	.owned-projects { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.45rem 0 0; padding: 0; list-style: none; }
	.owned-projects li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.36rem 0.42rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.3rem; }
	.owned-projects li > span { display: flex; min-width: 0; flex-direction: column; gap: 0.08rem; }
	.owned-projects strong { overflow: hidden; color: var(--editor-text-primary); font-size: 0.7rem; text-overflow: ellipsis; white-space: nowrap; }
	.owned-projects small { color: var(--editor-text-muted); font-size: 0.62rem; }
	.owned-projects button { padding: 0.25rem 0.45rem; border: 1px solid var(--editor-border-normal); border-radius: 0.25rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); font: inherit; font-size: 0.65rem; cursor: pointer; }
	.owned-projects button:disabled { opacity: 0.4; cursor: default; }
	.empty-projects, .cloud-error { margin: 0.5rem 0 0; color: var(--editor-text-muted); font-size: 0.66rem; line-height: 1.4; }
	.cloud-error { color: var(--editor-danger-fg); }
	.project-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; margin-top: 0.7rem; }
	.project-actions button {
		width: 100%;
		padding: 0.36rem 0.6rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.project-actions button:disabled { opacity: 0.4; cursor: default; }
	.project-actions button:hover:not(:disabled) { border-color: var(--editor-accent); }
	.project-actions .primary { border-color: var(--editor-accent-border); background: var(--editor-bg-control); color: var(--editor-text-primary); }
	.project-actions .primary:hover:not(:disabled) { background: var(--editor-bg-hover); }
	.project-actions .danger { border-color: var(--editor-danger-border); background: var(--editor-danger-soft); color: var(--editor-danger-fg); }
	.blocker {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.5rem 0 0;
		padding: 0.42rem 0.55rem;
		border: 1px solid var(--editor-danger-border);
		border-radius: 0.32rem;
		background: var(--editor-danger-soft);
		color: var(--editor-danger-fg);
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.blocker-dot { width: 0.42rem; height: 0.42rem; border-radius: 999px; background: var(--editor-danger); flex: 0 0 auto; }
	.blocker .link {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--editor-text-primary);
		font: inherit;
		font-size: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.blocker .link:hover:not(:disabled) { color: var(--editor-text-primary); }
	.blocker .link:disabled { opacity: 0.45; cursor: default; text-decoration: none; }
	.paste-import { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.7rem; color: var(--editor-text-secondary); font-size: 0.68rem; }
	.paste-import textarea { min-height: 4.5rem; resize: vertical; padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel); color: var(--editor-text-primary); font: 0.68rem/1.4 var(--editor-font); }
	.paste-action {
		width: 100%;
		margin-top: 0.4rem;
		padding: 0.36rem 0.6rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.paste-action:disabled { opacity: 0.4; cursor: default; }
	.paste-action:hover:not(:disabled) { border-color: var(--editor-accent); }
	.validation-errors { max-height: 8rem; overflow: auto; margin-top: 0.65rem; padding: 0.55rem; border: 1px solid var(--editor-danger-border); border-radius: 0.35rem; background: var(--editor-danger-soft); color: var(--editor-danger-fg); font-size: 0.68rem; line-height: 1.4; }
	.validation-errors ul { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.35rem 0 0; padding-left: 1.1rem; }
	.validation-errors code { color: var(--editor-text-primary); font-size: 0.64rem; }
	.validation-ok, .status { margin: 0.55rem 0 0; color: var(--editor-text-secondary); font-size: 0.68rem; line-height: 1.4; }
	.layout-json-section { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid var(--editor-border-subtle); }
	.layout-import-error { margin: 0.55rem 0 0; color: var(--editor-danger-fg); font-size: 0.68rem; line-height: 1.4; }
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
	.elevated > button { height:28px; padding:0 9px; }
	.elevated .project-menu { left:0; right:auto; }
</style>
