<script lang="ts">
	// H1 S4 — one project hierarchy over both documents, mounted in Plan and 3D.
	//
	// Rooms come from the layout (document order, via the pure model); clusters
	// and entities nest under their explicit roomId. Camera Flow embeds the
	// existing CameraFlowPanel (connections → directions → view keys stay in the
	// panel internals, unchanged). Selection is domain-driven: picks call the
	// source APIs the viewport calls, S3's hooks own cross-domain exclusivity,
	// and the highlight reads `ActiveEditorSelection.active` (plus the store's
	// camera discovery slots for direction rows — but direction rows render
	// inside the embedded panel, which already owns that rule).
	import { getMuseumAsset } from '$lib/content/assets';
	import { isSceneModelEntity, type SceneEntity } from '$lib/content/scene';
	import { formatPlacementLabel } from './editor-outliner';
	import type { LayoutPreviewState } from './layout/layout-preview-state.svelte';
	import {
		selectLayoutInteriorAnchor,
		selectLayoutObject,
		selectLayoutOpening,
		selectLayoutRoom,
		selectLayoutWall,
		type LayoutInteractionState
	} from './layout/layout-interaction';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import CameraFlowPanel from './CameraFlowPanel.svelte';
	import type { EditorActiveSelectionStore } from './h1/active-editor-selection.svelte';
	import {
		buildUnifiedProjectTreeModel,
		isUnifiedTreeRowInteractive,
		isUnifiedTreeRowSelected,
		layoutSelectionAncestorRoomId,
		type UnifiedTreeDiscovery,
		type UnifiedTreeRow,
		type UnifiedTreeRoom
	} from './unified-project-tree-model';
	import type { Editor3dContext } from './h1/editor-view-state.svelte';
	import type { EditorViewMode } from './h1/editor-view-mode';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		activeSelection,
		viewMode,
		active3dContext
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		activeSelection: EditorActiveSelectionStore;
		viewMode: EditorViewMode;
		active3dContext: Editor3dContext;
	} = $props();

	const model = $derived(
		buildUnifiedProjectTreeModel({
			layout: layoutPreview.project.layout,
			scene: store.document,
			guidedTourNodeIds: store.guidedTourNodeIds
		})
	);
	const active = $derived(activeSelection.active);
	// Camera discovery slots (reducer's discoveryConnectionId/discoveryDirection)
	// — only consulted by the matcher for direction rows, which the embedded
	// panel renders. Passed through for contract completeness.
	const discovery = $derived<UnifiedTreeDiscovery>({
		connectionId: store.activeCameraConnectionId,
		direction: store.activeCameraDirection
	});
	const sceneEntitiesById = $derived(new Map(store.document.entities.map((entity) => [entity.id, entity])));
	const clusteredPlacementIds = $derived(
		new Set((store.document.clusters ?? []).flatMap((cluster) => cluster.memberIds))
	);
	// Plan-view gate: scene/camera rows are read-only (aria-disabled, no click).
	const interactive = $derived(viewMode === '3d');

	let roomsOpen = $state(true);
	let cameraTourOpen = $state(false);

	// Camera Tour branch surfacing (preserved behavior): the camera context used
	// to surface the camera tree as the whole sidebar; as a collapsible branch it
	// could get buried. One-shot expansions on the *transition* into camera
	// context and into the camera domain (a camera pick) — not a continuous
	// derived, so a user's explicit collapse stays authoritative.
	$effect(() => {
		if (active3dContext === 'camera') cameraTourOpen = true;
	});
	$effect(() => {
		if (active.domain === 'camera') cameraTourOpen = true;
	});

	// Expansion seeding: `treeExpandedRoomIds` defaults to ['paris'] — a Chopin
	// room that never exists in a boot-empty H1 project. Trim the slot to live
	// layout room ids on model build (write only when it differs) so the first
	// drafted room starts collapsed and toggles stay in sync with the registry.
	$effect(() => {
		const liveRoomIds = new Set(model.rooms.map((room) => room.roomId));
		const current = store.treeExpandedRoomIds;
		if (current.some((id) => !liveRoomIds.has(id))) {
			store.treeExpandedRoomIds = current.filter((id) => liveRoomIds.has(id));
		}
	});

	// Pick-expand: reveal the active selection's row by expanding its ancestor
	// chain. Viewport picks of walls/openings/objects (layout) and
	// entities/clusters (scene) don't route through the tree's own select*
	// helpers (which already expand), so the tree must expand for **every**
	// active layout/scene selection — not just rooms — or the picked row stays
	// hidden inside a collapsed room/cluster ancestor. Camera ancestors are the
	// embedded panel's own effects (expandNode / expandActiveCameraDirection).
	$effect(() => {
		const selection = activeSelection.active;
		if (selection.domain === 'layout') {
			const roomId = layoutSelectionAncestorRoomId(
				selection.selection,
				layoutPreview.project.layout
			);
			if (roomId) {
				// The Rooms root is user-collapsible; reveal it too, or the
				// picked row stays hidden inside the collapsed root.
				roomsOpen = true;
				store.ensureRoomTreeExpanded(roomId);
			}
			return;
		}
		if (selection.domain === 'scene') {
			roomsOpen = true;
			const workspace = selection.selection;
			if (workspace.kind === 'cluster') {
				store.ensureRoomTreeExpanded(workspace.roomId);
				store.ensureClusterTreeExpanded(workspace.clusterId);
			} else if (workspace.kind === 'placement' && workspace.ids.length > 0) {
				store.ensureRoomTreeExpanded(workspace.roomId);
				// Viewport placement selections carry `clusterId: null`, so
				// membership must be resolved from the document clusters —
				// otherwise a picked member stays hidden inside its collapsed
				// cluster ancestor.
				const containingCluster = (store.document.clusters ?? []).find((cluster) =>
					cluster.memberIds.some((memberId) => workspace.ids.includes(memberId))
				);
				if (containingCluster) store.ensureClusterTreeExpanded(containingCluster.id);
			}
		}
	});

	function rowSelected(row: UnifiedTreeRow): boolean {
		// Room-only *latent* context derives to `domain: 'none'`, so the pure
		// matcher cannot see it — OR the same read the relic scene tree uses.
		return (
			isUnifiedTreeRowSelected(active, discovery, row) ||
			(row.kind === 'room' && active.domain === 'none' && store.selectedRoomId === row.roomId)
		);
	}

	function roomOpen(room: UnifiedTreeRoom): boolean {
		return store.treeExpandedRoomIds.includes(room.roomId);
	}

	function roomRowInteractive(row: UnifiedTreeRow): boolean {
		return isUnifiedTreeRowInteractive(row, viewMode);
	}

	function selectRoom(room: UnifiedTreeRoom) {
		selectLayoutRoom(layoutInteraction, room.roomId);
	}

	function selectWall(room: UnifiedTreeRoom, segmentId: string) {
		selectLayoutWall(layoutInteraction, room.roomId, segmentId);
	}

	function selectOpening(room: UnifiedTreeRoom, segmentId: string, openingId: string) {
		selectLayoutOpening(layoutInteraction, room.roomId, segmentId, openingId);
	}

	function selectAnchor(room: UnifiedTreeRoom, segmentId: string, anchorId: string) {
		selectLayoutInteriorAnchor(layoutInteraction, room.roomId, segmentId, anchorId);
	}

	function selectObject(objectId: string) {
		selectLayoutObject(layoutInteraction, objectId);
	}

	function selectEntity(entity: SceneEntity, event?: MouseEvent) {
		store.selectionActions.selectPlacementFromTree(entity.id, {
			additive: event?.shiftKey ?? false,
			focus: !(event?.shiftKey ?? false)
		});
	}

	function selectCluster(clusterId: string) {
		store.selectionActions.selectClusterFromTree(clusterId);
	}

	function entityLabel(entity: SceneEntity) {
		return entity.name.trim() || formatPlacementLabel(entity.id);
	}

	function entityMeta(entity: SceneEntity) {
		if (isSceneModelEntity(entity)) {
			return formatPlacementLabel(getMuseumAsset(entity.assetId).category);
		}
		if (entity.kind === 'primitive') return formatPlacementLabel(entity.primitive);
		return formatPlacementLabel(entity.light);
	}

</script>

<section class="unified-tree" aria-label="Project hierarchy">
	<div class="tree-root">
		<button
			type="button"
			class="tree-root__row"
			aria-expanded={roomsOpen}
			onclick={() => (roomsOpen = !roomsOpen)}
		>
			<span class="chevron" class:open={roomsOpen}>›</span>
			<span class="tree-row__label tree-root__label">Rooms</span>
			<span class="tree-row__meta">{model.rooms.length}</span>
		</button>
		{#if roomsOpen}
			{#if model.rooms.length === 0}
				<p class="empty">Draw a room in Plan to begin</p>
			{:else}
				<ul role="tree" aria-label="Rooms">
					{#each model.rooms as room (room.roomId)}
						{@const open = roomOpen(room)}
						{@const roomRow = { kind: 'room', roomId: room.roomId } satisfies UnifiedTreeRow}
						<li role="treeitem" aria-expanded={open} aria-selected={rowSelected(roomRow)}>
							<div class="room-line">
								<button
									type="button"
									class="tree-row__chevron"
									aria-label={`${open ? 'Collapse' : 'Expand'} ${room.name}`}
									aria-expanded={open}
									onclick={() => store.toggleRoomTreeExpansion(room.roomId)}
								>
									<span class="chevron" class:open={open}>›</span>
								</button>
								<button
									type="button"
									class="tree-row room-row"
									class:tree-row--selected={rowSelected(roomRow)}
									aria-disabled={!roomRowInteractive(roomRow)}
									onclick={roomRowInteractive(roomRow) ? () => selectRoom(room) : undefined}
								>
									<span class="tree-row__label" title={room.name}>{room.name}</span>
									<span class="tree-row__meta" title={room.roomId}>{formatPlacementLabel(room.roomId)}</span>
								</button>
							</div>
							{#if open}
								<ul class="room-children" role="group" aria-label={`${room.name} contents`}>
									{#if room.walls.length > 0 || room.openings.length > 0 || room.objects.length > 0}
										<li class="group-header" role="presentation">
											<span>Architecture</span>
										</li>
									{/if}
									{#each room.walls as wall (wall.segmentId)}
										{@const wallRow = {
											kind: 'wall',
											roomId: room.roomId,
											segmentId: wall.segmentId
										} satisfies UnifiedTreeRow}
										<li role="treeitem" aria-selected={rowSelected(wallRow)}>
											<button
												type="button"
												class="tree-row wall-row"
												class:tree-row--selected={rowSelected(wallRow)}
												aria-disabled={!roomRowInteractive(wallRow)}
												onclick={roomRowInteractive(wallRow)
													? () => selectWall(room, wall.segmentId)
													: undefined}
											>
												<span class="tree-row__label" title={wall.segmentId}>Wall · {formatPlacementLabel(wall.segmentId)}</span>
												{#if wall.anchors.length > 0}
													<span class="tree-row__meta">{wall.anchors.length}</span>
												{/if}
											</button>
											{#if wall.anchors.length > 0}
												<ul class="wall-children" role="group" aria-label={`${wall.segmentId} bend anchors`}>
													{#each wall.anchors as anchor (anchor.anchorId)}
														{@const anchorRow = {
															kind: 'interiorAnchor',
															roomId: anchor.roomId,
															segmentId: anchor.segmentId,
															anchorId: anchor.anchorId
														} satisfies UnifiedTreeRow}
														<li role="treeitem" aria-selected={rowSelected(anchorRow)}>
															<button
																type="button"
																class="tree-row anchor-row"
																class:tree-row--selected={rowSelected(anchorRow)}
																aria-disabled={!roomRowInteractive(anchorRow)}
																onclick={roomRowInteractive(anchorRow)
																	? () => selectAnchor(room, wall.segmentId, anchor.anchorId)
																	: undefined}
															>
																<span class="tree-row__label" title={anchor.anchorId}>Bend anchor · {formatPlacementLabel(anchor.anchorId)}</span>
															</button>
														</li>
													{/each}
												</ul>
											{/if}
										</li>
									{/each}
									{#each room.openings as opening (opening.openingId)}
										{@const openingRow = {
											kind: 'opening',
											roomId: opening.roomId,
											segmentId: opening.segmentId,
											openingId: opening.openingId
										} satisfies UnifiedTreeRow}
										<li role="treeitem" aria-selected={rowSelected(openingRow)}>
											<button
												type="button"
												class="tree-row opening-row"
												class:tree-row--selected={rowSelected(openingRow)}
												aria-disabled={!roomRowInteractive(openingRow)}
												onclick={roomRowInteractive(openingRow)
													? () => selectOpening(room, opening.segmentId, opening.openingId)
													: undefined}
											>
												<span class="tree-row__label">{opening.kind === 'door' ? 'Door' : 'Window'}</span>
												<span class="tree-row__meta" title={opening.openingId}>{formatPlacementLabel(opening.openingId)}</span>
											</button>
										</li>
									{/each}
									{#each room.objects as object (object.objectId)}
										{@const objectRow = { kind: 'object', objectId: object.objectId } satisfies UnifiedTreeRow}
										<li role="treeitem" aria-selected={rowSelected(objectRow)}>
											<button
												type="button"
												class="tree-row object-row"
												class:tree-row--selected={rowSelected(objectRow)}
												aria-disabled={!roomRowInteractive(objectRow)}
												onclick={roomRowInteractive(objectRow)
													? () => selectObject(object.objectId)
													: undefined}
											>
												<span class="tree-row__label" title={object.objectId}>{formatPlacementLabel(object.kind)} · {formatPlacementLabel(object.objectId)}</span>
											</button>
										</li>
									{/each}
									{#if room.clusters.length > 0 || room.entities.length > 0}
										<li class="group-header" role="presentation">
											<span>Scene</span>
										</li>
									{/if}
									{#each room.clusters as cluster (cluster.clusterId)}
										{@const clusterOpen = store.treeExpandedClusterIds.includes(cluster.clusterId)}
										{@const clusterRow = { kind: 'cluster', clusterId: cluster.clusterId } satisfies UnifiedTreeRow}
										<li
											role="treeitem"
											aria-expanded={clusterOpen}
											aria-selected={rowSelected(clusterRow)}
										>
											<div class="cluster-line">
												<button
													type="button"
													class="tree-row__chevron"
													aria-label={`${clusterOpen ? 'Collapse' : 'Expand'} ${cluster.name}`}
													aria-expanded={clusterOpen}
													onclick={() => store.toggleClusterTreeExpansion(cluster.clusterId)}
												>
													<span class="chevron" class:open={clusterOpen}>›</span>
												</button>
												<button
													type="button"
													class="tree-row cluster-row"
													class:tree-row--selected={rowSelected(clusterRow)}
													aria-disabled={!roomRowInteractive(clusterRow)}
													onclick={roomRowInteractive(clusterRow)
														? () => selectCluster(cluster.clusterId)
														: undefined}
												>
													<span class="cluster-title">
														<span class="folder-icon" aria-hidden="true"></span>
														<span class="tree-row__label" title={cluster.name}>{cluster.name}</span>
													</span>
													<span class="tree-row__meta">{cluster.memberIds.length}</span>
												</button>
											</div>
											{#if clusterOpen}
												<ul class="cluster-members" role="group" aria-label={`${cluster.name} members`}>
													{#each cluster.memberIds as memberId (memberId)}
														{@const entity = sceneEntitiesById.get(memberId)}
														{@const memberRow = { kind: 'entity', entityId: memberId } satisfies UnifiedTreeRow}
														{#if entity}
															<li role="treeitem" aria-selected={rowSelected(memberRow)}>
																<div class="member-line">
																	<button
																		type="button"
																		class="tree-row object-row"
																		class:tree-row--selected={rowSelected(memberRow)}
																		aria-disabled={!roomRowInteractive(memberRow)}
																		onclick={roomRowInteractive(memberRow)
																			? (event) => selectEntity(entity, event)
																			: undefined}
																	>
																		<span class="tree-row__label" title={entityLabel(entity)}>{entityLabel(entity)}</span>
																		<span class="tree-row__meta" title={entityMeta(entity)}>{entityMeta(entity)}</span>
																	</button>
																	<button
																		class="mini-action"
																		type="button"
																		aria-label={`Remove ${entityLabel(entity)} from ${cluster.name}`}
																		disabled={!interactive}
																		onclick={() => store.removeMemberFromCluster(cluster.clusterId, memberId)}
																	>−</button>
																</div>
															</li>
														{/if}
													{/each}
												</ul>
											{/if}
										</li>
									{/each}
									{#each room.entities as entry (entry.entityId)}
										{@const entity = sceneEntitiesById.get(entry.entityId)}
										{@const entityRow = { kind: 'entity', entityId: entry.entityId } satisfies UnifiedTreeRow}
										{#if entity && !clusteredPlacementIds.has(entry.entityId)}
											<li role="treeitem" aria-selected={rowSelected(entityRow)}>
												<div class="member-line">
													<button
														type="button"
														class="tree-row object-row"
														class:tree-row--selected={rowSelected(entityRow)}
														aria-disabled={!roomRowInteractive(entityRow)}
														onclick={roomRowInteractive(entityRow)
															? (event) => selectEntity(entity, event)
															: undefined}
													>
														<span class="tree-row__label" title={entityLabel(entity)}>{entityLabel(entity)}</span>
														<span class="tree-row__meta" title={entityMeta(entity)}>{entityMeta(entity)}</span>
													</button>
													{#if interactive && isSceneModelEntity(entity) && store.selectedCluster?.roomId === room.roomId}
														<button
															class="mini-action"
															type="button"
															aria-label={`Add ${entityLabel(entity)} to selected cluster`}
															onclick={() => store.addMemberToCluster(store.selectedClusterId!, entry.entityId)}
														>+</button>
													{/if}
												</div>
											</li>
										{/if}
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>

	<div class="tree-root">
		<button
			type="button"
			class="tree-root__row"
			aria-expanded={cameraTourOpen}
			onclick={() => (cameraTourOpen = !cameraTourOpen)}
		>
			<span class="chevron" class:open={cameraTourOpen}>›</span>
			<span class="tree-row__label tree-root__label">Camera Flow</span>
			<span class="tree-row__meta">{store.document.navigationNodes.length}</span>
		</button>
		{#if cameraTourOpen}
			{#if store.document.navigationNodes.length === 0}
				<p class="empty">No cameras</p>
			{:else}
				<CameraFlowPanel {store} interactive={interactive} activeDomain={active.domain} />
			{/if}
		{/if}
	</div>
</section>

<style>
	.unified-tree { display: flex; min-width: 0; flex-direction: column; gap: 0.6rem; }
	.tree-root { display: flex; min-width: 0; flex-direction: column; gap: 0.25rem; }
	.tree-root__row {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 2.125rem;
		box-sizing: border-box;
		align-items: center;
		gap: 0.45rem;
		padding: 0.28rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.tree-root__row:hover { border-color: #3a3a46; background: #202029; }
	.tree-root__label { font-size: 0.8rem; font-weight: 650; letter-spacing: 0.02em; }
	.chevron { display: block; font-size: 1rem; line-height: 1; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }
	ul { min-width: 0; margin: 0; padding: 0; list-style: none; }
	ul[role='tree'], .room-children, .cluster-members, .wall-children { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; }
	.room-line, .cluster-line { display: grid; min-width: 0; grid-template-columns: 1.7rem minmax(0, 1fr); gap: 0.1rem; }
	.tree-row { display: flex; width: 100%; min-width: 0; min-height: 2rem; box-sizing: border-box; align-items: center; gap: 0.45rem; padding: 0.28rem 0.45rem; border: 1px solid transparent; border-radius: 0.28rem; background: transparent; color: inherit; font: inherit; text-align: left; }
	button.tree-row { cursor: pointer; }
	button.tree-row:hover:not([aria-disabled='true']) { border-color: #3a3a46; background: #202029; }
	button.tree-row[aria-disabled='true'] { opacity: 0.6; }
	.tree-row--selected { border-color: #8d753c; background: #2a2618; box-shadow: inset 0 0 0 1px #6f5c31; color: #fff2c7; }
	.tree-row--selected[aria-disabled='true'] { opacity: 1; }
	.tree-row__chevron { display: grid; width: 1.7rem; min-height: 2rem; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 0.28rem; background: transparent; color: #d6b35f; cursor: pointer; }
	.tree-row__chevron:hover { border-color: #3a3a46; background: #202029; }
	.tree-row__label { min-width: 0; overflow: hidden; font-size: 0.74rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row__meta { min-width: 0; margin-left: auto; overflow: hidden; color: #918c84; font-size: 0.62rem; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row--selected .tree-row__meta { color: #e8d5a3; }
	.room-row { min-height: 2.125rem; }
	.room-children { margin: 0.12rem 0 0.2rem 0.85rem; padding-left: 0.65rem; border-left: 1px solid #36323a; }
	.group-header { padding: 0.3rem 0.45rem 0.1rem; color: #8f8a82; font-size: 0.62rem; font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; }
	.wall-children, .cluster-members { margin-left: 0.85rem; padding-left: 0.62rem; border-left: 1px solid #4a4438; }
	.cluster-row { justify-content: space-between; }
	.cluster-title { display: flex; min-width: 0; align-items: center; gap: 0.4rem; }
	.folder-icon { position: relative; display: inline-block; width: 0.78rem; height: 0.54rem; flex: 0 0 auto; margin-top: 0.08rem; border-radius: 0.1rem; background: #d6b35f; }
	.folder-icon::before { content: ''; position: absolute; left: 0.07rem; top: -0.15rem; width: 0.32rem; height: 0.18rem; border-radius: 0.08rem 0.08rem 0 0; background: #d6b35f; }
	.member-line { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 0.2rem; }
	.mini-action { width: 1.8rem; min-height: 2rem; padding: 0; border: 1px solid #3a3a46; border-radius: 0.28rem; background: #1a1a22; color: #f4efe4; cursor: pointer; }
	.mini-action:hover:not(:disabled) { border-color: #8d753c; background: #2a2618; }
	.mini-action:disabled { opacity: 0.35; cursor: default; }
	.empty { color: #918c84; font-size: 0.7rem; padding: 0.3rem 0.45rem 0.4rem; }
</style>
