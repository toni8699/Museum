<script lang="ts">
	import { getMuseumAsset } from '$lib/content/assets';
	import { museumRooms } from '$lib/content/rooms';
	import { tick } from 'svelte';
	import EditorAssetLibrary from './EditorAssetLibrary.svelte';
	import { formatPlacementLabel } from './editor-outliner';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store, outlinerElement = $bindable() }: {
		store: MuseumEditorStore;
		outlinerElement?: HTMLElement | null;
	} = $props();

	let clusterNameInput = $state<HTMLInputElement>();
	let clusterNameDraft = $state('');
	const parisOpen = $derived(store.treeExpandedRoomIds.includes('paris'));
	const openClusterIds = $derived(store.treeExpandedClusterIds);

	const selectedObject = $derived(store.selectedObject);
	const parisObjects = $derived(
		store.document.objects.filter((object) => object.roomId === 'paris')
	);
	const parisClusters = $derived(
		store.clusters.filter((cluster) => cluster.roomId === 'paris')
	);
	const clusteredPlacementIds = $derived(store.clusteredPlacementIds);
	const ungroupedParisObjects = $derived(
		parisObjects.filter((object) => !clusteredPlacementIds.has(object.id))
	);

	$effect(() => {
		clusterNameDraft = store.selectedCluster?.name ?? '';
	});

	function toggleParis() {
		if (store.isDocumentMutationBlocked) return;
		store.selectRoom('paris');
		store.focusRoom('paris');
		store.toggleRoomTreeExpansion('paris');
	}

	function toggleClusterOpen(id: string) {
		store.toggleClusterTreeExpansion(id);
	}

	function switchLeftPanel(panel: 'scene' | 'assets') {
		if (!store.setLeftPanel(panel)) return;
	}

	function selectObject(id: string, event?: MouseEvent) {
		store.ensureRoomTreeExpanded('paris');
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
		store.ensureClusterTreeExpanded(id);
	}

	async function groupSelection() {
		const clusterId = store.createCluster();
		if (!clusterId) return;
		store.ensureRoomTreeExpanded('paris');
		store.ensureClusterTreeExpanded(clusterId);
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
		store.toggleClusterTreeExpansion(cluster.id);
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
</script>

<aside
	bind:this={outlinerElement}
	class="panel outliner"
	aria-label="Outliner"
	inert={store.isDocumentMutationBlocked}
	style="grid-area: left;"
>
	<header>
		<h1>Museum editor</h1>
		<p>Phase 6.5 — camera path authoring</p>
	</header>

	<div class="panel-tabs" role="tablist" aria-label="Editor panels">
		<button
			type="button"
			role="tab"
			aria-selected={store.leftPanel === 'scene'}
			class:active={store.leftPanel === 'scene'}
			onclick={() => switchLeftPanel('scene')}
		>Scene</button>
		<button
			type="button"
			role="tab"
			aria-selected={store.leftPanel === 'assets'}
			class:active={store.leftPanel === 'assets'}
			onclick={() => switchLeftPanel('assets')}
		>Assets</button>
	</div>

	{#if store.leftPanel === 'scene'}
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

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-right: 1px solid #2a2a33;
		overflow: auto;
		background: #121218;
	}
	header h1, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	header p { margin: 0.35rem 0 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
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
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }
</style>
