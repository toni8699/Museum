<script lang="ts">
	import { getAsset } from '$lib/content/assets';
	import { rooms } from '$lib/content/rooms';
	import {
		isSceneModelEntity,
		type SceneEntity
	} from '$lib/content/scene';
	import type { RoomId } from '$lib/types/scene';
	import { formatPlacementLabel } from './editor-outliner';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

	const openClusterIds = $derived(store.treeExpandedClusterIds);
	const clusteredPlacementIds = $derived(
		new Set((store.document.clusters ?? []).flatMap((cluster) => cluster.memberIds))
	);

	function roomEntities(roomId: RoomId) {
		return store.document.entities.filter((entity) => entity.roomId === roomId);
	}

	function roomClusters(roomId: RoomId) {
		return (store.document.clusters ?? []).filter((cluster) => cluster.roomId === roomId);
	}

	function ungroupedEntities(roomId: RoomId) {
		return roomEntities(roomId).filter((entity) => !clusteredPlacementIds.has(entity.id));
	}

	function roomOpen(roomId: RoomId) {
		return store.treeExpandedRoomIds.includes(roomId);
	}

	function roomHasContent(roomId: RoomId) {
		return roomEntities(roomId).length > 0 || roomClusters(roomId).length > 0;
	}

	function selectRoom(roomId: RoomId) {
		if (store.isDocumentMutationBlocked) return;
		store.selectionActions.selectRoom(roomId);
		if (roomId === 'paris') store.focusRoom('paris');
	}

	function selectObject(id: string, event?: MouseEvent) {
		store.selectionActions.selectPlacementFromTree(id, {
			additive: event?.shiftKey ?? false,
			focus: !(event?.shiftKey ?? false)
		});
	}

	function selectCluster(id: string) {
		store.selectionActions.selectClusterFromTree(id);
	}

	function entityLabel(entity: SceneEntity) {
		return entity.name.trim() || formatPlacementLabel(entity.id);
	}

	function entityMeta(entity: SceneEntity) {
		if (isSceneModelEntity(entity)) {
			return formatPlacementLabel(getAsset(entity.assetId).category);
		}
		if (entity.kind === 'primitive') return formatPlacementLabel(entity.primitive);
		return formatPlacementLabel(entity.light);
	}
</script>

<section aria-label="Scene hierarchy">
	<div class="sidebar-section-header">
		<h2>Rooms</h2>
	</div>
	<ul class="rooms" role="tree" aria-label="Rooms and objects">
		{#each rooms as room (room.id)}
			{@const open = roomOpen(room.id)}
			{@const entities = roomEntities(room.id)}
			{@const clusters = roomClusters(room.id)}
			{@const ungrouped = ungroupedEntities(room.id)}
			{@const editable = room.id === 'paris' || roomHasContent(room.id)}
			<li
				role="treeitem"
				aria-expanded={editable ? open : undefined}
				aria-selected={store.selectedRoomId === room.id}
				aria-disabled={editable ? undefined : true}
			>
				{#if editable}
					<div class="room-line">
						<button
							type="button"
							class="tree-row__chevron"
							aria-label={`${open ? 'Collapse' : 'Expand'} ${room.title}`}
							aria-expanded={open}
							onclick={() => store.toggleRoomTreeExpansion(room.id)}
						>
							<span class="chevron" class:open={open}>›</span>
						</button>
						<button
							type="button"
							class="tree-row room-row"
							class:tree-row--selected={store.selectedRoomId === room.id}
							onclick={() => selectRoom(room.id)}
						>
							<span class="tree-row__label" title={room.title}>{room.title}</span>
							{#if room.id !== 'paris'}
								<span class="tree-row__meta">{entities.length}</span>
							{/if}
						</button>
					</div>

					{#if open}
						<ul class="objects" role="group" aria-label={`${room.title} objects`}>
							{#each clusters as cluster (cluster.id)}
								<li
									class="cluster-item"
									role="treeitem"
									aria-expanded={openClusterIds.includes(cluster.id)}
									aria-selected={store.selectedClusterId === cluster.id}
								>
									<div class="cluster-line">
										<button
											type="button"
											class="tree-row__chevron"
											aria-label={`${openClusterIds.includes(cluster.id) ? 'Collapse' : 'Expand'} ${cluster.name}`}
											aria-expanded={openClusterIds.includes(cluster.id)}
											onclick={() => store.toggleClusterTreeExpansion(cluster.id)}
										>
											<span class="chevron" class:open={openClusterIds.includes(cluster.id)}>›</span>
										</button>
										<button
											type="button"
											class="tree-row cluster-row"
											class:tree-row--selected={store.selectedClusterId === cluster.id}
											onclick={() => selectCluster(cluster.id)}
										>
											<span class="cluster-title">
												<span class="folder-icon" aria-hidden="true"></span>
												<span class="tree-row__label" title={cluster.name}>{cluster.name}</span>
											</span>
											<span class="tree-row__meta">{cluster.memberIds.length}</span>
										</button>
									</div>
									{#if openClusterIds.includes(cluster.id)}
										<ul class="cluster-members" role="group">
											{#each cluster.memberIds as memberId (memberId)}
												{@const object = entities.find((candidate) => candidate.id === memberId)}
												{#if object}
													<li
														class="member-line tree-child"
														role="treeitem"
														aria-selected={store.selectedPlacementIds.includes(object.id)}
													>
														<button
															type="button"
															class="tree-row object-row"
															class:tree-row--selected={store.selectedPlacementIds.includes(object.id)}
															onclick={(event) => selectObject(object.id, event)}
														>
															<span class="tree-row__label" title={entityLabel(object)}>{entityLabel(object)}</span>
															<span class="tree-row__meta" title={entityMeta(object)}>{entityMeta(object)}</span>
														</button>
														<button
															class="mini-action"
															type="button"
															aria-label={`Remove ${entityLabel(object)} from ${cluster.name}`}
															onclick={() => store.removeMemberFromCluster(cluster.id, object.id)}
														>−</button>
													</li>
												{/if}
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
							{#each ungrouped as entity (entity.id)}
								<li role="treeitem" aria-selected={store.selectedPlacementIds.includes(entity.id)}>
									<div class="member-line">
										<button
											type="button"
											class="tree-row object-row"
											class:tree-row--selected={store.selectedPlacementIds.includes(entity.id)}
											onclick={(event) => selectObject(entity.id, event)}
										>
											<span class="tree-row__label" title={entityLabel(entity)}>{entityLabel(entity)}</span>
											<span class="tree-row__meta" title={entityMeta(entity)}>{entityMeta(entity)}</span>
										</button>
										{#if store.selectedClusterId && isSceneModelEntity(entity) && room.id === 'paris'}
											<button
												class="mini-action"
												type="button"
												aria-label={`Add ${entityLabel(entity)} to selected cluster`}
												onclick={() => store.addMemberToCluster(store.selectedClusterId!, entity.id)}
											>+</button>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<div class="tree-row room-row room-row--read-only" aria-disabled="true">
						<span class="tree-row__chevron-spacer" aria-hidden="true"></span>
						<span class="tree-row__label" title={room.title}>{room.title}</span>
						<span class="tree-row__status">Read only</span>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	section { display: flex; min-width: 0; flex-direction: column; gap: 0.45rem; }
	.sidebar-section-header { display: flex; min-width: 0; min-height: 2rem; align-items: center; }
	.sidebar-section-header h2 { margin: 0; font-size: 0.82rem; font-weight: 650; letter-spacing: 0.02em; }
	ul { min-width: 0; margin: 0; padding: 0; list-style: none; }
	.rooms, .cluster-item, .cluster-members { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; }
	.room-line, .cluster-line { display: grid; min-width: 0; grid-template-columns: 1.7rem minmax(0, 1fr); gap: 0.1rem; }
	.tree-row { display: flex; width: 100%; min-width: 0; min-height: 2rem; box-sizing: border-box; align-items: center; gap: 0.45rem; padding: 0.28rem 0.45rem; border: 1px solid transparent; border-radius: 0.28rem; background: transparent; color: inherit; font: inherit; text-align: left; }
	button.tree-row { cursor: pointer; }
	button.tree-row:hover { border-color: #3a3a46; background: #202029; }
	.tree-row--selected { border-color: #8d753c; background: #2a2618; box-shadow: inset 0 0 0 1px #6f5c31; color: #fff2c7; }
	.tree-row__chevron { display: grid; width: 1.7rem; min-height: 2rem; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 0.28rem; background: transparent; color: #d6b35f; cursor: pointer; }
	.tree-row__chevron:hover { border-color: #3a3a46; background: #202029; }
	.chevron { display: block; font-size: 1rem; line-height: 1; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }
	.tree-row__chevron-spacer { width: 1.25rem; flex: 0 0 1.25rem; }
	.tree-row__label { min-width: 0; overflow: hidden; font-size: 0.76rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row__meta { min-width: 0; margin-left: auto; overflow: hidden; color: #918c84; font-size: 0.64rem; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row__status { flex: 0 0 auto; margin-left: auto; padding: 0.12rem 0.32rem; border: 1px solid #3a3a46; border-radius: 999px; color: #918c84; font-size: 0.61rem; white-space: nowrap; }
	.room-row { min-height: 2.125rem; }
	.room-row--read-only { opacity: 0.65; }
	.objects { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; margin: 0.16rem 0 0.24rem 0.85rem; padding-left: 0.65rem; border-left: 1px solid #36323a; }
	.cluster-row { justify-content: space-between; }
	.cluster-title { display: flex; min-width: 0; align-items: center; gap: 0.4rem; }
	.folder-icon { position: relative; display: inline-block; width: 0.78rem; height: 0.54rem; flex: 0 0 auto; margin-top: 0.08rem; border-radius: 0.1rem; background: #d6b35f; }
	.folder-icon::before { content: ''; position: absolute; left: 0.07rem; top: -0.15rem; width: 0.32rem; height: 0.18rem; border-radius: 0.08rem 0.08rem 0 0; background: #d6b35f; }
	.cluster-members { margin-left: 1.05rem; padding-left: 0.62rem; border-left: 1px solid #4a4438; }
	.member-line { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 0.2rem; }
	.tree-child { position: relative; }
	.tree-child::before { content: ''; position: absolute; left: -0.64rem; top: 1rem; width: 0.48rem; border-top: 1px solid #4a4438; }
	.object-row { min-height: 2rem; }
	.mini-action { width: 1.8rem; min-height: 2rem; padding: 0; border: 1px solid #3a3a46; border-radius: 0.28rem; background: #1a1a22; color: #f4efe4; cursor: pointer; }
	.mini-action:hover { border-color: #8d753c; background: #2a2618; }
</style>
