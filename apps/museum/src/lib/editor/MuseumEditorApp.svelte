<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { getMuseumAsset } from '$lib/content/assets';
	import { museumRooms } from '$lib/content/rooms';
	import {
		createMuseumEditorStore,
		EDITOR_BRIGHT_LIGHTING,
		EDITOR_VISITOR_LIGHTING
	} from './museum-editor.svelte';
	import EditorAssetLibrary from './EditorAssetLibrary.svelte';
	import EditorCameraInspector from './EditorCameraInspector.svelte';
	import EditorPlacementInspector from './EditorPlacementInspector.svelte';
	import EditorTransformInspector from './EditorTransformInspector.svelte';
	import EditorViewport from './EditorViewport.svelte';
	import { formatPlacementLabel } from './editor-outliner';

	const store = createMuseumEditorStore();
	let parisOpen = $state(false);
	let openClusterIds = $state<string[]>([]);
	let outlinerElement = $state<HTMLElement>();
	let viewportElement = $state<HTMLElement>();
	let clusterNameInput = $state<HTMLInputElement>();
	let clusterNameDraft = $state('');
	let leftPanel = $state<'scene' | 'assets'>('scene');

	const selectedObject = $derived(store.selectedObject);
	const selectedCameraNode = $derived(store.selectedNavigationNode);
	const singleEditableObject = $derived(
		store.selectedPlacementIds.length === 1 && !store.selectedClusterId
			? store.selectedObject
			: undefined
	);
	const parisObjects = $derived(
		store.document.objects.filter((object) => object.roomId === 'paris')
	);
	const parisClusters = $derived(
		store.clusters.filter((cluster) => cluster.roomId === 'paris')
	);
	const clusteredPlacementIds = $derived(
		new Set(parisClusters.flatMap((cluster) => cluster.memberIds))
	);
	const ungroupedParisObjects = $derived(
		parisObjects.filter((object) => !clusteredPlacementIds.has(object.id))
	);
	const selectionContainsClusteredPlacement = $derived(
		store.selectedPlacementIds.some((id) => clusteredPlacementIds.has(id))
	);
	const canGroupSelection = $derived(
		store.selectedPlacementIds.length >= 2 &&
		!store.selectedClusterId &&
		!selectionContainsClusteredPlacement
	);

	$effect(() => {
		clusterNameDraft = store.selectedCluster?.name ?? '';
	});

	function toggleParis() {
		if (store.isCameraPreviewActive) return;
		store.selectRoom('paris');
		store.focusRoom('paris');
		parisOpen = !parisOpen;
	}

	function switchLeftPanel(panel: 'scene' | 'assets') {
		if (store.isCameraPreviewActive) return;
		if (panel === 'scene') store.cancelAssetPlacement();
		leftPanel = panel;
	}

	function selectObject(id: string, event?: MouseEvent) {
		parisOpen = true;
		if (event?.shiftKey) {
			store.togglePlacement(id);
		} else {
			store.selectPlacement(id);
			store.focusPlacement(id);
		}
	}

	function selectCameraNode(id: string) {
		store.selectNavigationNode(id);
	}

	function selectCluster(id: string) {
		store.selectCluster(id);
		store.focusSelection();
		if (!openClusterIds.includes(id)) openClusterIds = [...openClusterIds, id];
	}

	function toggleClusterOpen(id: string) {
		openClusterIds = openClusterIds.includes(id)
			? openClusterIds.filter((clusterId) => clusterId !== id)
			: [...openClusterIds, id];
	}

	async function groupSelection() {
		const clusterId = store.createCluster();
		if (!clusterId) return;

		parisOpen = true;
		if (!openClusterIds.includes(clusterId)) {
			openClusterIds = [...openClusterIds, clusterId];
		}
		store.focusSelection();

		await tick();
		if (store.selectedClusterId !== clusterId) return;
		clusterNameInput?.focus();
		clusterNameInput?.select();
	}

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
		openClusterIds = openClusterIds.filter((id) => id !== cluster.id);
		store.setStatusMessage(`Ungrouped ${cluster.name}`);
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

	function editorOwnsSceneShortcuts() {
		if (leftPanel !== 'scene') return Boolean(viewportElement?.contains(document.activeElement));
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
				}
				return;
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
				if (store.cancelAssetPlacement('Placement cancelled')) {
					event.preventDefault();
					return;
				}
				if (sceneOwnsShortcuts) store.deselect();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<main class="page" class:previewing={store.isCameraPreviewActive}>
	<aside
		bind:this={outlinerElement}
		class="panel outliner"
		aria-label="Outliner"
		inert={store.isCameraPreviewActive}
	>
		<header>
			<h1>Museum editor</h1>
			<p>Phase 6 — camera editing and preview</p>
		</header>

		<div class="panel-tabs" role="tablist" aria-label="Editor panels">
			<button
				type="button"
				role="tab"
				aria-selected={leftPanel === 'scene'}
				class:active={leftPanel === 'scene'}
				onclick={() => switchLeftPanel('scene')}
			>Scene</button>
			<button
				type="button"
				role="tab"
				aria-selected={leftPanel === 'assets'}
				class:active={leftPanel === 'assets'}
				onclick={() => switchLeftPanel('assets')}
			>Assets</button>
		</div>

		{#if leftPanel === 'scene'}
		<section aria-label="Scene hierarchy">
			<h2>Rooms</h2>
			<ul class="rooms" role="tree" aria-label="Museum rooms and objects">
				{#each museumRooms as room (room.id)}
					<li
						role="treeitem"
						aria-expanded={room.id === 'paris' ? parisOpen : undefined}
						aria-selected={store.selectedRoomId === room.id}
					>
						{#if room.id === 'paris'}
							<button
								type="button"
								class="room-row editable"
								class:selected={store.selectedRoomId === room.id}
								aria-expanded={parisOpen}
								onclick={toggleParis}
							>
								<span class="chevron" class:open={parisOpen}>›</span>
								<span>
									<strong>{room.title}</strong>
									<small>{room.subtitle}</small>
								</span>
							</button>

							{#if parisOpen}
								<ul class="objects" role="group" aria-label="Paris Salon objects">
									{#each parisClusters as cluster (cluster.id)}
										<li
											class="cluster-item"
											role="treeitem"
											aria-expanded={openClusterIds.includes(cluster.id)}
											aria-selected={store.selectedClusterId === cluster.id}
										>
											<div class="cluster-line">
												<button
													type="button"
													class="chevron-button"
													aria-label={`Toggle ${cluster.name}`}
													aria-expanded={openClusterIds.includes(cluster.id)}
													onclick={() => toggleClusterOpen(cluster.id)}
												>
													<span class="chevron" class:open={openClusterIds.includes(cluster.id)}>›</span>
												</button>
												<button
													type="button"
													class="object-row cluster-row"
													class:selected={store.selectedClusterId === cluster.id}
													onclick={() => selectCluster(cluster.id)}
												>
													<span class="cluster-title">
														<span class="folder-icon" aria-hidden="true"></span>
														<span>{cluster.name}</span>
													</span>
													<span class="meta">{cluster.memberIds.length} objects</span>
												</button>
											</div>
											{#if openClusterIds.includes(cluster.id)}
												<ul class="cluster-members" role="group">
													{#each cluster.memberIds as memberId (memberId)}
														{@const object = parisObjects.find((candidate) => candidate.id === memberId)}
														{#if object}
															<li
																class="member-line tree-child"
																role="treeitem"
																aria-selected={store.selectedPlacementIds.includes(object.id)}
															>
																<button
																	type="button"
																	class="object-row"
																	class:selected={store.selectedPlacementIds.includes(object.id)}
																	onclick={(event) => selectObject(object.id, event)}
																>
																	<span class="placement-name">{formatPlacementLabel(object.id)}</span>
																	<span class="meta">{formatPlacementLabel(getMuseumAsset(object.assetId).category)}</span>
																</button>
																<button class="mini-action" type="button" aria-label={`Remove ${formatPlacementLabel(object.id)} from ${cluster.name}`} onclick={() => store.removeMemberFromCluster(cluster.id, object.id)}>−</button>
															</li>
														{/if}
													{/each}
												</ul>
											{/if}
										</li>
									{/each}
									{#each ungroupedParisObjects as object (object.id)}
										<li
											role="treeitem"
											aria-selected={store.selectedPlacementIds.includes(object.id)}
										>
											<div class="member-line">
												<button
													type="button"
													class="object-row"
													class:selected={store.selectedPlacementIds.includes(object.id)}
													onclick={(event) => selectObject(object.id, event)}
												>
													<span class="placement-name">{formatPlacementLabel(object.id)}</span>
													<span class="meta">{formatPlacementLabel(getMuseumAsset(object.assetId).category)}</span>
												</button>
												{#if store.selectedClusterId}
													<button class="mini-action" type="button" aria-label={`Add ${formatPlacementLabel(object.id)} to selected cluster`} onclick={() => store.addMemberToCluster(store.selectedClusterId!, object.id)}>+</button>
												{/if}
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						{:else}
							<div class="room-row placeholder" aria-disabled="true">
								<span>
									<strong>{room.title}</strong>
									<small>Editing coming later</small>
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<section class="camera-nodes" aria-label="Camera nodes">
			<h2>Camera nodes ({store.nodeCount})</h2>
			<ul>
				{#each store.document.navigationNodes as node (node.id)}
					<li>
						<button
							type="button"
							class="camera-node-row"
							class:selected={store.cameraSelection?.nodeId === node.id}
							onclick={() => selectCameraNode(node.id)}
						>
							<strong>{node.label}</strong>
							<span>{node.roomId} · <span class="id">{node.id}</span></span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
		{:else}
			<EditorAssetLibrary {store} />
		{/if}

		<a class="back" href="/museum">Back to museum</a>
	</aside>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div bind:this={viewportElement} class="center" role="application" aria-label="3D editor viewport" tabindex="0" onpointerdown={(event) => event.currentTarget.focus()}>
		<EditorViewport {store} />
	</div>

	<aside class="panel inspector" aria-label="Inspector">
		<header>
			<div class="inspector-title">
				<h2>Inspector</h2>
				<div class="history" aria-label="History controls">
					<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}>Undo</button>
					<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}>Redo</button>
				</div>
			</div>
			{#if leftPanel === 'assets'}
				<p>Browse the manifest and choose a floor asset to place.</p>
			{:else if selectedCameraNode}
				<p class="id">{selectedCameraNode.id} · {store.cameraSelection?.handle}</p>
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

		{#if leftPanel === 'scene'}
		{#if selectedCameraNode}
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
					<form class="rename-form" onsubmit={(event) => { event.preventDefault(); saveClusterName(); }}>
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
								disabled={!clusterNameDraft.trim() || clusterNameDraft.trim() === store.selectedCluster.name}
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
				disabled={store.isCameraPreviewActive}
				onclick={() => store.toggleCameraPan()}
			>
				Pan {store.cameraPanEnabled ? 'on' : 'off'}
			</button>
		</section>

		<section class="lighting" aria-label="Viewport lighting">
			<h2>Lighting</h2>
			<p>Session-only; excluded from history and visitor JSON.</p>
			<div class="presets">
				<button type="button" disabled={store.isCameraPreviewActive} onclick={() => store.applyLightingPreset(EDITOR_BRIGHT_LIGHTING)}>Bright</button>
				<button type="button" disabled={store.isCameraPreviewActive} onclick={() => store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)}>Visitor</button>
			</div>
			<label><span>Ambient {store.ambientIntensity.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" disabled={store.isCameraPreviewActive} bind:value={store.ambientIntensity} /></label>
			<label><span>Directional {store.directionalIntensity.toFixed(2)}</span><input type="range" min="0" max="3" step="0.05" disabled={store.isCameraPreviewActive} bind:value={store.directionalIntensity} /></label>
			<label class="checkbox"><input type="checkbox" disabled={store.isCameraPreviewActive} bind:checked={store.fogEnabled} /><span>Fog</span></label>
			{#if store.fogEnabled}
				<label><span>Fog near {store.fogNear.toFixed(0)}</span><input type="range" min="1" max="80" step="1" disabled={store.isCameraPreviewActive} bind:value={store.fogNear} /></label>
				<label><span>Fog far {store.fogFar.toFixed(0)}</span><input type="range" min="5" max="120" step="1" disabled={store.isCameraPreviewActive} bind:value={store.fogFar} /></label>
			{/if}
		</section>
	</aside>
</main>

<style>
	:global(body) { margin: 0; }
	.page { display: grid; grid-template-columns: minmax(17rem, 21rem) 1fr minmax(17rem, 20rem); height: 100vh; background: #0b0b10; color: #f4efe4; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
	.panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.1rem; border-right: 1px solid #2a2a33; overflow: auto; background: #121218; }
	.inspector { border-right: 0; border-left: 1px solid #2a2a33; }
	header h1, header h2, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	header p, .lighting p, .meta { margin: 0.35rem 0 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	section { display: flex; flex-direction: column; gap: 0.55rem; }
	.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.panel-tabs button { padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #a8a29a; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.panel-tabs button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	ul { list-style: none; margin: 0; padding: 0; }
	.rooms { display: flex; flex-direction: column; gap: 0.4rem; }
	.camera-nodes { padding-top: 0.85rem; border-top: 1px solid #2a2a33; }
	.camera-nodes ul { display: flex; flex-direction: column; gap: 0.3rem; }
	.camera-node-row { display: flex; flex-direction: column; gap: 0.12rem; width: 100%; padding: 0.48rem 0.52rem; border: 1px solid transparent; border-radius: 0.34rem; background: #181820; color: inherit; text-align: left; cursor: pointer; }
	.camera-node-row:hover { border-color: #3a3a46; background: #202029; }
	.camera-node-row.selected { border-color: #d6b35f; background: #2a2618; }
	.camera-node-row strong { font-size: 0.76rem; font-weight: 620; }
	.camera-node-row > span { color: #918c84; font-size: 0.67rem; }
	.room-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; box-sizing: border-box; padding: 0.55rem; border: 1px solid transparent; border-radius: 0.4rem; background: #1a1a22; color: inherit; text-align: left; }
	.room-row span:not(.chevron) { display: flex; flex-direction: column; gap: 0.12rem; }
	.room-row strong { font-size: 0.8rem; font-weight: 620; }
	.room-row small { color: #918c84; font-size: 0.7rem; }
	.room-row.editable { cursor: pointer; font: inherit; }
	.room-row.editable:hover { border-color: #4a4438; background: #22222c; }
	.room-row.selected { border-color: #d6b35f; background: #2a2618; }
	.room-row.placeholder { opacity: 0.58; }
	.chevron { color: #d6b35f; font-size: 1.15rem; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }
	.objects { display: flex; flex-direction: column; gap: 0.28rem; margin: 0.35rem 0 0.2rem 1rem; padding-left: 0.55rem; border-left: 1px solid #36323a; }
	.object-row { display: flex; flex-direction: column; gap: 0.1rem; width: 100%; padding: 0.4rem 0.45rem; border: 1px solid transparent; border-radius: 0.3rem; background: #16161d; color: inherit; text-align: left; cursor: pointer; }
	.object-row:hover { border-color: #3a3a46; background: #202029; }
	.object-row.selected { border-color: #d6b35f; background: #2a2618; box-shadow: inset 0 0 0 1px #d6b35f; }
	.cluster-item, .cluster-members { display: flex; flex-direction: column; gap: 0.25rem; }
	.cluster-line, .member-line { display: flex; align-items: stretch; gap: 0.25rem; }
	.cluster-row { flex: 1; }
	.cluster-title { display: flex; align-items: center; gap: 0.42rem; font-weight: 620; }
	.folder-icon { position: relative; display: inline-block; width: 0.9rem; height: 0.62rem; flex: 0 0 auto; margin-top: 0.12rem; border-radius: 0.12rem; background: #d6b35f; }
	.folder-icon::before { content: ''; position: absolute; left: 0.08rem; top: -0.18rem; width: 0.38rem; height: 0.22rem; border-radius: 0.1rem 0.1rem 0 0; background: #d6b35f; }
	.cluster-members { margin-left: 1.1rem; padding-left: 0.7rem; border-left: 1px solid #4a4438; }
	.tree-child { position: relative; }
	.tree-child::before { content: ''; position: absolute; left: -0.72rem; top: 50%; width: 0.55rem; border-top: 1px solid #4a4438; }
	.chevron-button, .mini-action { border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #f4efe4; cursor: pointer; }
	.chevron-button { width: 1.7rem; padding: 0; }
	.mini-action { width: 1.8rem; flex: 0 0 1.8rem; }
	.placement-name { font-size: 0.76rem; font-weight: 570; }
	.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
	.center { min-width: 0; min-height: 0; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px #d6b35f; }
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }
	.inspector-title { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.history, .presets { display: flex; gap: 0.35rem; }
	.history button, .presets button, .deselect, .camera-controls button { padding: 0.38rem 0.5rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.history button:disabled { opacity: 0.4; cursor: default; }
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
</style>
