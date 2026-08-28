<script lang="ts">
	// P1.7 — dedicated Camera-domain sidebar (shell spec §4; terminology per
	// Camera-flow-specs.md §2). The left panel becomes the canonical four
	// sections:
	//
	//   Environment · Sequence Inspector · Unsequenced · Connections
	//
	// Environment is read-only spatial context (scene / floors / rooms /
	// architectural elements), rebuilt from the same pure unified-tree model
	// the Scene tree uses — Camera domain must never mutate it. The other three
	// sections come from the existing CameraFlowPanel (chain + loop row +
	// detours under Sequence Inspector; free nodes under Unsequenced; every
	// connection listed undirected under Connections), which already owns
	// selection, drag reorder, and history semantics.
	import { formatPlacementLabel } from '$lib/editor/editor-outliner';
	import CameraFlowPanel from '$lib/editor/CameraFlowPanel.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import {
		buildUnifiedProjectTreeModel,
		type UnifiedTreeRoom
	} from '$lib/editor/unified-project-tree-model';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';

	let {
		store,
		layoutPreview
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
	} = $props();

	const model = $derived(
		buildUnifiedProjectTreeModel({
			layout: layoutPreview.project.layout,
			scene: store.document,
			guidedTourNodeIds: store.guidedTourNodeIds
		})
	);

	// Environment expansion is component-local and read-only: nothing here can
	// mutate layout or selection.
	let expandedRoomIds = $state<string[]>([]);

	function roomOpen(room: UnifiedTreeRoom): boolean {
		return expandedRoomIds.includes(room.roomId);
	}

	function toggleRoom(roomId: string) {
		if (expandedRoomIds.includes(roomId)) {
			expandedRoomIds = expandedRoomIds.filter((id) => id !== roomId);
			return;
		}
		expandedRoomIds = [...expandedRoomIds, roomId];
	}

	function objectLabel(kind: string, objectId: string): string {
		return `${formatPlacementLabel(kind)} · ${formatPlacementLabel(objectId)}`;
	}
</script>

<section class="camera-sidebar" aria-label="Camera sidebar">
	<div class="sidebar-section-header">
		<h2>Environment</h2>
		<span aria-label={`${model.rooms.length} rooms`}>{model.rooms.length}</span>
	</div>
	{#if model.rooms.length === 0}
		<p class="empty">No environment yet</p>
	{:else}
		<ul role="tree" aria-label="Environment rooms">
			{#each model.rooms as room (room.roomId)}
				{@const open = roomOpen(room)}
				<li role="treeitem" aria-expanded={open} aria-selected={false}>
					<div class="env-room-line">
						<button
							type="button"
							class="tree-row__chevron"
							aria-label={`${open ? 'Collapse' : 'Expand'} ${room.name}`}
							aria-expanded={open}
							onclick={() => toggleRoom(room.roomId)}
						>
							<span class="chevron" class:open={open}>›</span>
						</button>
						<span class="tree-row env-room" aria-disabled="true">
							<span class="tree-row__label" title={room.name}>{room.name}</span>
							<span class="tree-row__meta" title={room.roomId}>{formatPlacementLabel(room.roomId)}</span>
						</span>
					</div>
					{#if open}
						<ul class="env-children" role="group" aria-label={`${room.name} architecture`}>
							{#each room.walls as wall (wall.segmentId)}
								<li role="treeitem" aria-selected={false}>
									<span class="tree-row" aria-disabled="true">
										<span class="tree-row__label" title={wall.segmentId}>Wall · {formatPlacementLabel(wall.segmentId)}</span>
										{#if wall.anchors.length > 0}
											<span class="tree-row__meta">{wall.anchors.length}</span>
										{/if}
									</span>
								</li>
							{/each}
							{#each room.openings as opening (opening.openingId)}
								<li role="treeitem" aria-selected={false}>
									<span class="tree-row" aria-disabled="true">
										<span class="tree-row__label">{opening.kind === 'door' ? 'Door' : 'Window'}</span>
										<span class="tree-row__meta" title={opening.openingId}>{formatPlacementLabel(opening.openingId)}</span>
									</span>
								</li>
							{/each}
							{#each room.objects as object (object.objectId)}
								<li role="treeitem" aria-selected={false}>
									<span class="tree-row" aria-disabled="true">
										<span class="tree-row__label" title={object.objectId}>{objectLabel(object.kind, object.objectId)}</span>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<CameraFlowPanel {store} />
</section>

<style>
	.camera-sidebar { display: flex; min-width: 0; flex-direction: column; gap: 0.6rem; }

	.sidebar-section-header {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2rem;
	}
	.sidebar-section-header h2 {
		min-width: 0;
		margin: 0;
		font-size: 0.68rem;
		font-weight: 650;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--editor-text-secondary);
	}
	.sidebar-section-header span {
		flex: 0 0 auto;
		color: var(--editor-text-muted);
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
	}

	ul { min-width: 0; margin: 0; padding: 0; list-style: none; }
	ul[role='tree'], .env-children { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; }

	.env-room-line { display: grid; min-width: 0; grid-template-columns: 1.7rem minmax(0, 1fr); gap: 0.1rem; }
	.tree-row__chevron {
		display: grid;
		width: 1.7rem;
		min-height: 2rem;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: var(--editor-accent);
		cursor: pointer;
	}
	.tree-row__chevron:hover { border-color: var(--editor-border-normal); background: var(--editor-bg-control); }
	.chevron { display: block; font-size: 1rem; line-height: 1; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }

	.tree-row {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 2rem;
		box-sizing: border-box;
		align-items: center;
		gap: 0.55rem;
		padding: 0.28rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	.tree-row[aria-disabled='true'] { opacity: 0.72; cursor: default; }
	.tree-row__label { min-width: 0; overflow: hidden; font-size: 0.74rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row__meta { min-width: 0; margin-left: auto; overflow: hidden; color: var(--editor-text-muted); font-size: 0.62rem; text-overflow: ellipsis; white-space: nowrap; }
	.env-children { margin: 0.12rem 0 0.2rem 0.85rem; padding-left: 0.65rem; border-left: 1px solid var(--editor-border-subtle); }

	.empty { color: var(--editor-text-muted); font-size: 0.7rem; padding: 0.3rem 0.45rem 0.4rem; }
</style>
