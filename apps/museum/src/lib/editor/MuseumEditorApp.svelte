<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { parseSceneDocumentJson } from '$lib/content/scene-codec';
	import {
		createMuseumEditorStore,
		EDITOR_BRIGHT_LIGHTING,
		EDITOR_VISITOR_LIGHTING
	} from './museum-editor.svelte';
	import EditorAppBar from './EditorAppBar.svelte';
	import EditorCameraInspector from './EditorCameraInspector.svelte';
	import EditorCameraPreviewControls from './EditorCameraPreviewControls.svelte';
	import EditorCameraTimelineFrame from './EditorCameraTimelineFrame.svelte';
	import EditorLeftSidebar from './EditorLeftSidebar.svelte';
	import EditorPlacementInspector from './EditorPlacementInspector.svelte';
	import EditorTransformInspector from './EditorTransformInspector.svelte';
	import EditorViewport from './EditorViewport.svelte';

	const store = createMuseumEditorStore();
	let outlinerElement = $state<HTMLElement | null>(null);
	let viewportElement = $state<HTMLElement | null>(null);
	let clusterNameInput = $state<HTMLInputElement>();
	let clusterNameDraft = $state('');
	let importFileInput = $state<HTMLInputElement>();
	let pastedSceneJson = $state('');

	const selectedObject = $derived(store.selectedObject);
	const selectedCameraNode = $derived(store.selectedNavigationNode);
	const selectedNavigation = $derived(store.navigationSelection);
	const singleEditableObject = $derived(
		store.selectedPlacementIds.length === 1 && !store.selectedClusterId
			? store.selectedObject
			: undefined
	);
	const selectionContainsClusteredPlacement = $derived(
		store.selectedPlacementIds.some((id) => store.clusteredPlacementIds.has(id))
	);
	const canGroupSelection = $derived(
		store.selectedPlacementIds.length >= 2 &&
			!store.selectedClusterId &&
			!selectionContainsClusteredPlacement
	);

	$effect(() => {
		clusterNameDraft = store.selectedCluster?.name ?? '';
	});

	function saveClusterName() {
		const cluster = store.selectedCluster;
		if (!cluster) return;
		const nextName = clusterNameDraft.trim();
		if (!nextName) {
			store.setStatusMessage('Cluster name cannot be empty');
			clusterNameInput?.focus();
			return;
		}
		if (nextName === cluster.name) return;
		if (store.renameCluster(cluster.id, nextName)) {
			clusterNameDraft = nextName;
			store.setStatusMessage(`Renamed cluster to ${nextName}`);
		}
	}

	function ungroupSelection() {
		const cluster = store.selectedCluster;
		if (!cluster || !store.ungroupCluster(cluster.id)) return;
		store.removeClusterTreeExpansion(cluster.id);
		store.setStatusMessage(`Ungrouped ${cluster.name}`);
	}

	async function groupSelection() {
		const clusterId = store.createCluster();
		if (!clusterId) return;
		ensureGroupingVisibility(clusterId);
		store.focusSelection();
		await tick();
		if (store.selectedClusterId !== clusterId) return;
		clusterNameInput?.focus();
		clusterNameInput?.select();
	}

	function ensureGroupingVisibility(clusterId: string) {
		store.ensureRoomTreeExpanded('paris');
		store.ensureClusterTreeExpanded(clusterId);
	}

	function onClusterNameKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		const cluster = store.selectedCluster;
		if (!cluster) return;
		event.preventDefault();
		event.stopPropagation();
		clusterNameDraft = cluster.name;
		clusterNameInput?.select();
	}

	function confirmDiscardUnsavedChanges() {
		return !store.isDirty || window.confirm('Discard unsaved scene changes?');
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

	beforeNavigate((navigation) => {
		if (!store.isDirty || navigation.willUnload) return;
		if (!confirmDiscardUnsavedChanges()) navigation.cancel();
	});

	function editorOwnsSceneShortcuts() {
		if (store.leftPanel !== 'scene') {
			return Boolean(viewportElement?.contains(document.activeElement));
		}
		const active = document.activeElement;
		return Boolean(
			active &&
				(outlinerElement?.contains(active) || viewportElement?.contains(active))
		);
	}

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
	}

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (store.cameraPreview) {
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					store.stopCameraPreview();
					return;
				}
				if (store.isDocumentMutationBlocked) return;
			}
			if (isEditableTarget(event.target)) return;
			const modifier = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();
			const sceneOwnsShortcuts = editorOwnsSceneShortcuts();

			if (modifier && key === 'z') {
				event.preventDefault();
				if (event.shiftKey) store.redo();
				else store.undo();
			} else if (modifier && event.ctrlKey && key === 'y') {
				event.preventDefault();
				store.redo();
			} else if (
				modifier &&
				!event.shiftKey &&
				!event.altKey &&
				key === 'd' &&
				sceneOwnsShortcuts &&
				store.selectedPlacementIds.length > 0
			) {
				if (store.duplicateSelection()) {
					event.preventDefault();
					event.stopPropagation();
				}
			} else if (modifier && key === 'g' && sceneOwnsShortcuts) {
				event.preventDefault();
				event.stopPropagation();
				if (event.shiftKey) ungroupSelection();
				else void groupSelection();
			} else if (modifier && key === 'a' && sceneOwnsShortcuts) {
				event.preventDefault();
				event.stopPropagation();
				store.selectAllInRoom();
			} else if (
				!modifier &&
				!event.altKey &&
				(event.key === 'Delete' || event.key === 'Backspace') &&
				sceneOwnsShortcuts &&
				store.selectedPlacementIds.length > 0
			) {
				if (store.deleteSelection()) {
					event.preventDefault();
					event.stopPropagation();
				}
			} else if (!modifier && !event.altKey && event.key === 'End' && sceneOwnsShortcuts) {
				event.preventDefault();
				store.requestDropToFloor();
			} else if (!modifier && !event.altKey && key === 'f' && sceneOwnsShortcuts) {
				event.preventDefault();
				store.focusSelection();
			} else if (!modifier && !event.altKey && event.key === 'Escape') {
				if (store.transformInteractionActive) return;
				if (store.cancelPendingNavigation('Camera command cancelled')) {
					event.preventDefault();
					return;
				}
				if (store.cancelAssetPlacement('Placement cancelled')) {
					event.preventDefault();
					return;
				}
				if (store.finishAnchorEditing()) {
					event.preventDefault();
					return;
				}
				if (store.finishViewKeyframeEditing()) {
					event.preventDefault();
					return;
				}
				if (sceneOwnsShortcuts) store.deselect();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});

	$effect(() => {
		if (!store.isDirty) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
</script>

<main class="page" class:previewing={store.isDocumentMutationBlocked}>
	<EditorAppBar {store} />
	<EditorLeftSidebar {store} bind:outlinerElement />
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div
		bind:this={viewportElement}
		class="center"
		role="application"
		aria-label="3D editor viewport"
		tabindex="0"
		onpointerdown={(event) => event.currentTarget.focus()}
		style="grid-area: center;"
	>
		<EditorViewport {store} />
	</div>
	<aside class="panel inspector" aria-label="Inspector" style="grid-area: right;">
		<header>
			<h2>Inspector</h2>
			{#if store.leftPanel === 'assets'}
				<p>Browse the manifest and choose a floor asset to place.</p>
			{:else if selectedNavigation?.kind === 'node' && selectedCameraNode}
				<p class="id">{selectedCameraNode.id} · {store.cameraSelection?.handle}</p>
			{:else if selectedNavigation?.kind === 'connection'}
				<p class="id">{selectedNavigation.connectionId} · connection</p>
			{:else if selectedNavigation?.kind === 'anchor'}
				<p class="id">{selectedNavigation.anchorId} · anchor</p>
			{:else if selectedNavigation?.kind === 'view-keyframe'}
				<p class="id">{selectedNavigation.keyframeId} · {selectedNavigation.direction} view</p>
			{:else if store.selectedCluster}
				<p>{store.selectedCluster.name} · {store.selectedPlacementIds.length} selected</p>
			{:else if store.selectedPlacementIds.length > 1}
				<p>{store.selectedPlacementIds.length} selected</p>
			{:else if selectedObject}
				<p class="id">{selectedObject.id}</p>
			{:else if store.selectedRoomId === 'paris'}
				<p>Paris is centered. Select an object to edit it.</p>
			{:else}
				<p>Select Paris Salon to begin editing.</p>
			{/if}
		</header>

		{#if store.cameraPreview}
			<section class="camera-preview" aria-label="Active camera preview">
				<EditorCameraPreviewControls {store} />
			</section>
		{/if}

		{#if store.leftPanel === 'scene'}
			{#if selectedNavigation}
				<EditorCameraInspector {store} />
			{:else}
				<section class="grouping" aria-label="Group selection">
					<div class="section-heading">
						<h2>Group selection</h2>
						{#if store.selectedCluster}<span class="grouped-badge">Grouped</span>{/if}
					</div>

					{#if store.selectedCluster}
						<p class="group-summary">
							<strong>{store.selectedCluster.name}</strong>
							<span>{store.selectedCluster.memberIds.length} objects in this cluster</span>
						</p>
						{#key store.selectedCluster.id}
							<form
								class="rename-form"
								onsubmit={(event) => {
									event.preventDefault();
									saveClusterName();
								}}
							>
								<label class="rename">
									<span>Cluster name</span>
									<input
										bind:this={clusterNameInput}
										bind:value={clusterNameDraft}
										aria-label="Cluster name"
										onkeydown={onClusterNameKeyDown}
									/>
								</label>
								<div class="group-actions">
									<button
										type="submit"
										class="primary-action"
										disabled={!clusterNameDraft.trim() ||
											clusterNameDraft.trim() === store.selectedCluster.name}
									>Save name</button>
									<button type="button" class="danger-action" onclick={ungroupSelection}>Ungroup</button>
								</div>
							</form>
						{/key}
					{:else}
						<p class="group-hint" id="group-selection-hint">
							{#if selectionContainsClusteredPlacement}
								Selected objects must be ungrouped before creating another cluster.
							{:else if store.selectedPlacementIds.length === 0}
								Select at least two objects to create a cluster.
							{:else if store.selectedPlacementIds.length === 1}
								Select one more object to create a cluster.
							{:else}
								Ready to create a folder-style cluster from this selection.
							{/if}
						</p>
						<button
							type="button"
							class="group-button"
							disabled={!canGroupSelection}
							aria-describedby="group-selection-hint"
							onclick={() => void groupSelection()}
						>
							{store.selectedPlacementIds.length >= 2
								? `Group ${store.selectedPlacementIds.length} objects`
								: 'Group selection'}
						</button>
					{/if}
				</section>

				{#if !store.selectedCluster && store.selectedPlacementIds.length > 1}
					<section class="selection" aria-label="Multiple selection">
						<p>{store.selectedPlacementIds.length} objects selected. Numeric transforms are available for a single object.</p>
						<button type="button" class="deselect" onclick={() => store.deselect()}>Clear selection</button>
					</section>
				{:else if singleEditableObject}
					<section class="selection" aria-label="Selection">
						<dl>
							<div><dt>Room</dt><dd>{singleEditableObject.roomId}</dd></div>
							<div><dt>Asset</dt><dd class="id">{singleEditableObject.assetId}</dd></div>
						</dl>
						<button type="button" class="deselect" onclick={() => store.deselect()}>Deselect object</button>
					</section>
					{#key singleEditableObject.id}
						<EditorTransformInspector {store} />
					{/key}
				{/if}

				{#if store.selectedPlacementIds.length > 0}
					<section class="placement-actions" aria-label="Placement actions">
						<h2>Placement actions</h2>
						<div>
							<button type="button" onclick={() => store.duplicateSelection()}>
								Duplicate{store.selectedPlacementIds.length > 1 ? ` ${store.selectedPlacementIds.length}` : ''}
							</button>
							<button type="button" class="delete" onclick={() => store.deleteSelection()}>
								Delete{store.selectedPlacementIds.length > 1 ? ` ${store.selectedPlacementIds.length}` : ''}
							</button>
						</div>
						<p>Cmd/Ctrl+D duplicates · Delete removes · Undo restores</p>
					</section>
				{/if}

				<EditorPlacementInspector {store} />
			{/if}
		{/if}

		<section class="camera-controls" aria-label="Editor camera controls">
			<h2>Camera</h2>
			<p>Middle-drag pans. Camera-node rows frame their authored eye and target.</p>
			<button
				type="button"
				class:active={store.cameraPanEnabled}
				aria-pressed={store.cameraPanEnabled}
				disabled={store.isVisitorCameraPreview}
				onclick={() => store.toggleCameraPan()}
			>
				Pan {store.cameraPanEnabled ? 'on' : 'off'}
			</button>
			<button
				type="button"
				class:active={store.gridVisible}
				aria-pressed={store.gridVisible}
				disabled={store.isVisitorCameraPreview}
				onclick={() => store.toggleGrid()}
			>
				Grid {store.gridVisible ? 'on' : 'off'}
			</button>
		</section>

		<section class="lighting" aria-label="Viewport lighting">
			<h2>Lighting</h2>
			<p>Session-only; excluded from history and visitor JSON.</p>
			<div class="presets">
				<button type="button" disabled={store.isVisitorCameraPreview} onclick={() => store.applyLightingPreset(EDITOR_BRIGHT_LIGHTING)}>Bright</button>
				<button type="button" disabled={store.isVisitorCameraPreview} onclick={() => store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)}>Visitor</button>
			</div>
			<label><span>Ambient {store.ambientIntensity.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" disabled={store.isVisitorCameraPreview} bind:value={store.ambientIntensity} /></label>
			<label><span>Directional {store.directionalIntensity.toFixed(2)}</span><input type="range" min="0" max="3" step="0.05" disabled={store.isVisitorCameraPreview} bind:value={store.directionalIntensity} /></label>
			<label class="checkbox"><input type="checkbox" disabled={store.isVisitorCameraPreview} bind:checked={store.fogEnabled} /><span>Fog</span></label>
			{#if store.fogEnabled}
				<label><span>Fog near {store.fogNear.toFixed(0)}</span><input type="range" min="1" max="80" step="1" disabled={store.isVisitorCameraPreview} bind:value={store.fogNear} /></label>
				<label><span>Fog far {store.fogFar.toFixed(0)}</span><input type="range" min="5" max="120" step="1" disabled={store.isVisitorCameraPreview} bind:value={store.fogFar} /></label>
			{/if}
		</section>

		<section class="persistence" aria-label="Scene persistence">
			<div class="section-heading">
				<h2>Scene JSON</h2>
				<span class:dirty={store.isDirty} class="document-state">{store.isDirty ? 'Unsaved' : 'Saved'}</span>
			</div>
			<p>Browser-only export. Downloading or copying does not mark this session saved.</p>
			<input
				bind:this={importFileInput}
				class="visually-hidden"
				type="file"
				accept="application/json,.json"
				onchange={onImportFileChange}
			/>
			<div class="persistence-actions">
				<button type="button" onclick={() => importFileInput?.click()}>Import file</button>
				<button type="button" disabled={!store.canExport} onclick={copySceneJson}>Copy JSON</button>
				<button type="button" disabled={!store.canExport} onclick={downloadSceneJson}>Download</button>
				<button type="button" class="danger-action" onclick={resetScene}>Reset to checked-in scene</button>
			</div>
			<label class="paste-import">
				<span>Paste scene JSON</span>
				<textarea bind:value={pastedSceneJson} spellcheck="false" placeholder={'{ ... }'}></textarea>
			</label>
			<button type="button" disabled={!pastedSceneJson.trim()} onclick={() => importSceneJson(pastedSceneJson, true)}>Import pasted JSON</button>
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
		</section>
	</aside>
	<EditorCameraTimelineFrame {store} />
</main>

<style>
	:global(body) { margin: 0; }
	.page {
		display: grid;
		grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr) minmax(17rem, 22rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'top top top'
			'left center right'
			'bottom bottom bottom';
		height: 100vh;
		background: #0b0b10;
		color: #f4efe4;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-right: 1px solid #2a2a33;
		overflow: auto;
		background: #121218;
	}
	.inspector { border-right: 0; border-left: 1px solid #2a2a33; }
	header h2, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
header p { margin: 0.35rem 0 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }	section { display: flex; flex-direction: column; gap: 0.55rem; }
	.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.presets { display: flex; gap: 0.35rem; }
	.presets button, .deselect, .camera-controls button { padding: 0.38rem 0.5rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.camera-controls button:disabled, .presets button:disabled { opacity: 0.4; cursor: default; }
	.selection dl { margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
	.selection dl div { display: flex; flex-direction: column; gap: 0.1rem; }
	.selection dt { color: #8f8a82; font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.selection dd { margin: 0; font-size: 0.8rem; }
	.selection p { margin: 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	.grouping { padding: 0.85rem; border: 1px solid #34313a; border-radius: 0.45rem; background: #17171f; }
	.grouped-badge { padding: 0.18rem 0.42rem; border: 1px solid #8d753c; border-radius: 999px; background: #2a2618; color: #f4dc9b; font-size: 0.65rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
	.group-summary { display: flex; flex-direction: column; gap: 0.12rem; margin: 0; }
	.group-summary strong { font-size: 0.82rem; }
	.group-summary span, .group-hint { color: #a8a29a; font-size: 0.72rem; line-height: 1.4; }
	.group-hint { margin: 0; }
	.rename-form { display: flex; flex-direction: column; gap: 0.55rem; }
	.rename { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.75rem; }
	.rename input { padding: 0.4rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #f4efe4; font: inherit; }
	.rename input:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.group-actions { display: flex; gap: 0.4rem; }
	.group-button, .primary-action, .danger-action { padding: 0.46rem 0.58rem; border: 1px solid #4a4438; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.group-button { align-self: flex-start; }
	.primary-action { border-color: #8d753c; }
	.danger-action { background: #21191b; color: #efc7c7; }
	.group-button:disabled, .primary-action:disabled { opacity: 0.4; cursor: default; }
	.placement-actions { padding: 0.75rem; border: 1px solid #34313a; border-radius: 0.45rem; background: #17171f; }
	.placement-actions div { display: flex; gap: 0.4rem; }
	.placement-actions button { flex: 1; padding: 0.44rem; border: 1px solid #4a4438; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.placement-actions button.delete { border-color: #684147; background: #21191b; color: #efc7c7; }
	.placement-actions p { margin: 0; color: #918c84; font-size: 0.67rem; line-height: 1.4; }
	.deselect { align-self: flex-start; }
	.camera-controls, .lighting { margin-top: 0.4rem; gap: 0.7rem; border-top: 1px solid #2a2a33; padding-top: 0.85rem; }
	.camera-controls p { margin: 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	.camera-controls button { align-self: flex-start; }
	.camera-controls button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.presets button { flex: 1; }
	.lighting label { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.75rem; }
	.lighting label.checkbox { flex-direction: row; align-items: center; gap: 0.45rem; }
	.lighting input[type='range'] { width: 100%; }
	.persistence { margin-top: 0.4rem; gap: 0.65rem; border-top: 1px solid #2a2a33; padding-top: 0.85rem; }
	.persistence > p, .validation-ok, .status { margin: 0; color: #a8a29a; font-size: 0.72rem; line-height: 1.4; }
	.document-state { padding: 0.18rem 0.42rem; border: 1px solid #52634e; border-radius: 999px; background: #182218; color: #cfe9c4; font-size: 0.64rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
	.document-state.dirty { border-color: #8d753c; background: #2a2618; color: #f4dc9b; }
	.persistence-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; }
	.persistence button { padding: 0.4rem 0.48rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.7rem; cursor: pointer; }
	.persistence button:disabled { opacity: 0.4; cursor: default; }
	.persistence .danger-action { border-color: #684147; background: #21191b; color: #efc7c7; }
	.paste-import { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.72rem; }
	.paste-import textarea { min-height: 5.2rem; resize: vertical; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #101016; color: #f4efe4; font: 0.68rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
	.validation-errors { padding: 0.55rem; border: 1px solid #684147; border-radius: 0.35rem; background: #21191b; color: #efc7c7; font-size: 0.68rem; line-height: 1.4; }
	.validation-errors ul { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.35rem; }
	.validation-errors code { color: #f4dc9b; font-size: 0.64rem; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
	.center { min-width: 0; min-height: 0; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px #d6b35f; }
</style>
