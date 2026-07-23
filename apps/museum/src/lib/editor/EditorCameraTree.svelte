<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import { formatCameraNodeLabel } from './editor-outliner';
	import type {
		SceneCameraViewKeyframe,
		SceneConnectionViewTracks
	} from '$lib/content/scene';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	type CameraKeyframeRow = {
		id: string;
		direction: CameraConnectionDirection;
		connectionId: string;
	};

	function readKeyframes(
		tracks: SceneConnectionViewTracks | undefined,
		direction: CameraConnectionDirection
	): SceneCameraViewKeyframe[] {
		if (!tracks) return [];
		return direction === 'forward' ? tracks.forward : tracks.reverse;
	}

	const guidedTourChain = $derived(store.guidedTourNodeIds);
	const freeNodeIds = $derived(
		store.document.navigationNodes
			.filter((node) => !guidedTourChain.includes(node.id))
			.map((node) => node.id)
	);
	const selectedFreeNodeId = $derived(
		store.navigationSelection?.kind === 'node' &&
			freeNodeIds.includes(store.navigationSelection.nodeId)
			? store.navigationSelection.nodeId
			: null
	);
	const guidedEditingBlocked = $derived(
		store.isDocumentMutationBlocked ||
			store.isEditorInteractionActive ||
			store.pendingNavigationCommand !== null
	);
	let draggedNodeId = $state<string | null>(null);

	function keyframesFor(
		connectionId: string,
		direction: CameraConnectionDirection
	): CameraKeyframeRow[] {
		const connection = store.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return [];
		return readKeyframes(connection.viewTracks, direction).map((keyframe) => ({
			id: keyframe.id,
			direction,
			connectionId
		}));
	}

	function isConnectionExpanded(connectionId: string) {
		return store.treeExpandedCameraConnectionIds.includes(connectionId);
	}

	function isDirectionExpanded(
		connectionId: string,
		direction: CameraConnectionDirection
	) {
		return store.treeExpandedCameraDirectionKeys.includes(
			`${connectionId}:${direction}`
		);
	}

	function directionKeys(connectionId: string) {
		return {
			forward: `${connectionId}:forward`,
			reverse: `${connectionId}:reverse`
		} as const;
	}

	function isConnectionHeaderSelected(connectionId: string) {
		const selection = store.navigationSelection;
		if (
			selection?.kind === 'connection' ||
			selection?.kind === 'anchor' ||
			selection?.kind === 'view-keyframe'
		) {
			return selection.connectionId === connectionId;
		}
		return false;
	}

	function isDirectionSelected(
		connectionId: string,
		direction: CameraConnectionDirection
	) {
		return (
			isConnectionHeaderSelected(connectionId) &&
			store.activeCameraConnectionId === connectionId &&
			store.activeCameraDirection === direction
		);
	}

	function isKeyframeSelected(row: CameraKeyframeRow) {
		return (
			store.navigationSelection?.kind === 'view-keyframe' &&
			store.navigationSelection.connectionId === row.connectionId &&
			store.navigationSelection.direction === row.direction &&
			store.navigationSelection.keyframeId === row.id
		);
	}

	function isNodeSelected(nodeId: string) {
		return (
			store.navigationSelection?.kind === 'node' &&
			store.navigationSelection.nodeId === nodeId
		);
	}

	function beginNodeDrag(event: DragEvent, nodeId: string) {
		if (guidedEditingBlocked) {
			event.preventDefault();
			return;
		}
		draggedNodeId = nodeId;
		event.dataTransfer?.setData('text/plain', nodeId);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function finishNodeDrag() {
		draggedNodeId = null;
	}

	function moveGuidedNode(nodeId: string, delta: -1 | 1) {
		const nodeIds = [...guidedTourChain];
		const index = nodeIds.indexOf(nodeId);
		const destination = index + delta;
		if (index <= 0 || destination <= 0 || destination >= nodeIds.length) return;
		[nodeIds[index], nodeIds[destination]] = [
			nodeIds[destination]!,
			nodeIds[index]!
		];
		store.setGuidedTourOrder(nodeIds);
	}

	function dropNodeAfter(event: DragEvent, anchorNodeId: string, gapIndex: number) {
		event.preventDefault();
		const nodeId = draggedNodeId ?? event.dataTransfer?.getData('text/plain');
		draggedNodeId = null;
		if (!nodeId || guidedEditingBlocked) return;
		if (!guidedTourChain.includes(nodeId)) {
			store.insertNodeIntoGuidedTour(nodeId, gapIndex);
			return;
		}
		if (nodeId === anchorNodeId) return;
		const nodeIds = guidedTourChain.filter((candidate) => candidate !== nodeId);
		const anchorIndex = nodeIds.indexOf(anchorNodeId);
		if (anchorIndex < 0) return;
		nodeIds.splice(anchorIndex + 1, 0, nodeId);
		store.setGuidedTourOrder(nodeIds);
	}
</script>

<section class="camera-tree" aria-label="Camera tree">
	<div class="sidebar-section-header">
		<h2>Guided Tour</h2>
		<span aria-label={`${guidedTourChain.length} guided stops`}>{guidedTourChain.length}</span>
	</div>
	{#if guidedTourChain.length > 0}
		<ul role="tree" aria-label="Guided tour stops">
			{#each guidedTourChain as nodeId, index (nodeId)}
				{@const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)}
				{#if node}
					<li
						role="treeitem"
						aria-selected={isNodeSelected(node.id)}
						aria-grabbed={draggedNodeId === node.id}
						draggable={index > 0 && !guidedEditingBlocked}
						ondragstart={(event) => beginNodeDrag(event, node.id)}
						ondragend={finishNodeDrag}
					>
						<div class="guided-line">
							<button
								type="button"
								class="tree-row"
								class:tree-row--selected={isNodeSelected(node.id)}
								onclick={() => store.selectNavigationNode(node.id)}
							>
								<span class="tree-row__sequence" aria-hidden="true">
									{String(index + 1).padStart(2, '0')}
								</span>
								<span class="tree-row__label" title={formatCameraNodeLabel(node.label, node.id)}>
									{formatCameraNodeLabel(node.label, node.id)}
								</span>
								{#if index === 0}<span class="tree-row__meta">Start</span>{/if}
							</button>
							<div class="guided-actions" aria-label={`Edit ${node.label} guided order`}>
								<button
									type="button"
									aria-label={`Move ${node.label} earlier`}
									title="Move earlier"
									disabled={guidedEditingBlocked || index <= 1}
									onclick={() => moveGuidedNode(node.id, -1)}
								>↑</button>
								<button
									type="button"
									aria-label={`Move ${node.label} later`}
									title="Move later"
									disabled={guidedEditingBlocked || index === 0 || index >= guidedTourChain.length - 1}
									onclick={() => moveGuidedNode(node.id, 1)}
								>↓</button>
								<button
									type="button"
									class="guided-remove"
									aria-label={`Remove ${node.label} from guided tour`}
									title={index === 0 ? 'Guided start is pinned' : 'Remove from guided tour'}
									disabled={guidedEditingBlocked || index === 0 || guidedTourChain.length <= 2}
									onclick={() => store.removeNodeFromGuidedTour(node.id)}
								>×</button>
							</div>
						</div>
					</li>
					{#if draggedNodeId || selectedFreeNodeId}
						<li
							role="none"
							class="guided-gap"
							class:guided-gap--dragging={draggedNodeId !== null}
							ondragover={(event) => event.preventDefault()}
							ondrop={(event) => dropNodeAfter(event, node.id, index + 1)}
						>
							{#if selectedFreeNodeId}
								{@const selectedFreeNode = store.document.navigationNodes.find(
									(candidate) => candidate.id === selectedFreeNodeId
								)}
								<button
									type="button"
									disabled={guidedEditingBlocked}
									onclick={() => store.insertNodeIntoGuidedTour(selectedFreeNodeId, index + 1)}
								>
									+ Insert {selectedFreeNode?.label ?? selectedFreeNodeId} here
								</button>
							{:else}
								<span>Drop between stops</span>
							{/if}
						</li>
					{/if}
				{/if}
			{/each}
		</ul>
	{:else}
		<p class="empty"><strong>No guided tour</strong></p>
	{/if}

	{#if freeNodeIds.length > 0}
		<div class="sidebar-section-header">
			<h2>Free Nodes</h2>
			<span aria-label={`${freeNodeIds.length} free nodes`}>{freeNodeIds.length}</span>
		</div>
		<ul role="tree" aria-label="Free navigation nodes">
			{#each freeNodeIds as nodeId (nodeId)}
				{@const node = store.document.navigationNodes.find(
					(candidate) => candidate.id === nodeId
				)}
				{#if node}
					<li
						role="treeitem"
						aria-selected={isNodeSelected(node.id)}
						aria-grabbed={draggedNodeId === node.id}
						draggable={!guidedEditingBlocked}
						ondragstart={(event) => beginNodeDrag(event, node.id)}
						ondragend={finishNodeDrag}
					>
						<button
							type="button"
							class="tree-row"
							class:tree-row--selected={isNodeSelected(node.id)}
							onclick={() => store.selectNavigationNode(node.id)}
						>
							<span class="tree-row__diamond" aria-hidden="true">◆</span>
							<span class="tree-row__label" title={formatCameraNodeLabel(node.label, node.id)}>
								{formatCameraNodeLabel(node.label, node.id)}
							</span>
							<span class="tree-row__meta">Drag to guided</span>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}

	<div class="sidebar-section-header">
		<h2>Connections</h2>
		<span aria-label={`${store.document.connections.length} connections`}>{store.document.connections.length}</span>
	</div>
	{#if store.document.connections.length > 0}
		<ul class="connections" role="tree" aria-label="Camera connections and view keys">
			{#each store.document.connections as connection (connection.id)}
				{@const keys = directionKeys(connection.id)}
				{@const forward = keyframesFor(connection.id, 'forward')}
				{@const reverse = keyframesFor(connection.id, 'reverse')}
				<li
					role="treeitem"
					aria-expanded={isConnectionExpanded(connection.id)}
					aria-selected={isConnectionHeaderSelected(connection.id)}
				>
					<div class="connection-line">
						<button
							type="button"
							class="tree-row__chevron"
							aria-label={`${isConnectionExpanded(connection.id) ? 'Collapse' : 'Expand'} ${connection.id}`}
							aria-expanded={isConnectionExpanded(connection.id)}
							onclick={() => store.toggleCameraConnectionTreeExpansion(connection.id)}
						>
							<span class="chevron" class:open={isConnectionExpanded(connection.id)}>›</span>
						</button>
						<button
							type="button"
							class="tree-row connection-row"
							class:tree-row--selected={isConnectionHeaderSelected(connection.id)}
							onclick={() =>
								store.selectCameraConnectionDirection(connection.id, 'forward')}
							title={connection.id}
						>
							<span class="tree-row__label" title={connection.id}>{connection.id}</span>
							<span class="tree-row__meta">{(forward.length + reverse.length)}</span>
						</button>
					</div>
					{#if isConnectionExpanded(connection.id)}
						<ul class="direction-group" role="group">
							{#each ['forward', 'reverse'] as const as direction (keys[direction])}
								{@const expanded = isDirectionExpanded(connection.id, direction)}
								{@const keyframes = direction === 'forward' ? forward : reverse}
								<li
									role="treeitem"
									aria-expanded={expanded}
									aria-selected={isDirectionSelected(connection.id, direction)}
								>
									<div class="direction-line">
										<button
											type="button"
											class="tree-row__chevron"
											aria-label={`${expanded ? 'Collapse' : 'Expand'} ${direction} keys`}
											aria-expanded={expanded}
											onclick={() =>
												store.toggleCameraDirectionTreeExpansion(connection.id, direction)}
										>
											<span class="chevron" class:open={expanded}>›</span>
										</button>
										<button
											type="button"
											class="tree-row direction-row"
											class:tree-row--selected={isDirectionSelected(
												connection.id,
												direction
											)}
											class:direction-row--empty={keyframes.length === 0}
											onclick={() =>
												store.selectCameraConnectionDirection(connection.id, direction)}
										>
											<span class="direction-badge">{direction === 'forward' ? '▶' : '◀'}</span>
											<span class="tree-row__label">{direction}</span>
											<span class="tree-row__meta">{keyframes.length}</span>
										</button>
									</div>
									{#if expanded}
										<ul class="keyframe-list" role="group">
											{#if keyframes.length === 0}
												<li class="empty-row" role="presentation">
													<span class="empty-row__text">No view keys</span>
												</li>
											{/if}
											{#each keyframes as keyframe (keyframe.id)}
												{@const progress = readKeyframes(
													store.document.connections.find(
														(candidate) => candidate.id === keyframe.connectionId
													)?.viewTracks,
													keyframe.direction
												).find((candidate) => candidate.id === keyframe.id)?.progress}
												<li
													role="treeitem"
													aria-selected={isKeyframeSelected(keyframe)}
												>
													<button
														type="button"
														class="tree-row keyframe-row"
														class:tree-row--selected={isKeyframeSelected(keyframe)}
												onclick={() =>
													store.selectCameraTimelineViewKeyframe(
														keyframe.connectionId,
																keyframe.direction,
																keyframe.id
															)}
													>
														<span class="tree-row__diamond" aria-hidden="true">◇</span>
														<span class="tree-row__label" title={keyframe.id}>{keyframe.id}</span>
														{#if progress !== undefined}
															<span class="tree-row__meta">{Math.round(progress * 100)}%</span>
														{/if}
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty"><strong>No connections</strong></p>
	{/if}
	{#if store.document.navigationNodes.length === 0 && store.document.connections.length === 0}
		<p class="empty"><strong>No cameras</strong></p>
	{/if}
</section>

<style>
	.camera-tree { display: flex; min-width: 0; flex-direction: column; gap: 0.55rem; }
	.sidebar-section-header {
		display: flex; min-width: 0; align-items: center;
		justify-content: space-between; gap: 0.75rem;
		min-height: 2rem;
	}
	.sidebar-section-header h2 { min-width: 0; margin: 0; font-size: 0.78rem; font-weight: 650; letter-spacing: 0.02em; color: #d6c7a8; }
	.sidebar-section-header span { flex: 0 0 auto; color: #918c84; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
	ul { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; margin: 0; padding: 0; list-style: none; }
	.connection-line, .direction-line { display: grid; min-width: 0; grid-template-columns: 1.7rem minmax(0, 1fr); gap: 0.1rem; }
	.guided-line { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; gap: 0.16rem; }
	.guided-actions { display: flex; align-items: stretch; gap: 0.08rem; }
	.guided-actions button {
		width: 1.45rem; min-height: 2rem; padding: 0; border: 1px solid transparent;
		border-radius: 0.25rem; background: transparent; color: #aaa39a; cursor: pointer;
	}
	.guided-actions button:hover:not(:disabled) { border-color: #3a3a46; background: #202029; color: #fff2c7; }
	.guided-actions button.guided-remove { color: #c9877f; }
	.guided-actions button:disabled { opacity: 0.25; cursor: default; }
	.guided-gap { display: flex; min-height: 0.35rem; align-items: center; justify-content: center; }
	.guided-gap button {
		width: 100%; padding: 0.2rem 0.4rem; border: 1px dashed #6f5c31;
		border-radius: 0.25rem; background: #211e15; color: #d9c27f;
		font: inherit; font-size: 0.64rem; cursor: pointer;
	}
	.guided-gap--dragging { min-height: 1.5rem; border: 1px dashed #6f5c31; border-radius: 0.25rem; color: #9f8c5b; font-size: 0.62rem; }
	.tree-row {
		display: flex; width: 100%; min-width: 0; min-height: 2rem;
		box-sizing: border-box; align-items: center; gap: 0.55rem;
		padding: 0.28rem 0.45rem;
		border: 1px solid transparent; border-radius: 0.28rem;
		background: transparent; color: inherit;
		font: inherit; text-align: left; cursor: pointer;
	}
	.tree-row:hover { border-color: #3a3a46; background: #202029; }
	.tree-row--selected { border-color: #8d753c; background: #2a2618; box-shadow: inset 0 0 0 1px #6f5c31; color: #fff2c7; }
	.tree-row__sequence, .tree-row__diamond {
		flex: 0 0 1.25rem; color: #918c84;
		font-size: 0.7rem; font-variant-numeric: tabular-nums;
	}
	.tree-row__diamond { color: #d6b35f; }
	.tree-row--selected .tree-row__diamond { color: #fff2c7; }
	.direction-badge { flex: 0 0 1.1rem; color: #d6b35f; font-size: 0.7rem; }
	.tree-row--selected .direction-badge { color: #fff2c7; }
	.tree-row__label { min-width: 0; overflow: hidden; font-size: 0.74rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
	.tree-row__meta { min-width: 0; margin-left: auto; color: #918c84; font-size: 0.62rem; font-variant-numeric: tabular-nums; }
	.tree-row--selected .tree-row__meta { color: #e8d5a3; }
	.tree-row__chevron {
		display: grid; width: 1.7rem; min-height: 2rem;
		place-items: center; padding: 0; border: 1px solid transparent;
		border-radius: 0.28rem; background: transparent;
		color: #d6b35f; cursor: pointer;
	}
	.tree-row__chevron:hover { border-color: #3a3a46; background: #202029; }
	.chevron { display: block; font-size: 1rem; line-height: 1; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }
	.direction-row--empty .tree-row__label { color: #918c84; font-style: italic; }
	.connections { gap: 0.16rem; }
	.direction-group { margin: 0.12rem 0 0.22rem 0.85rem; padding-left: 0.65rem; border-left: 1px solid #36323a; gap: 0.12rem; }
	.keyframe-list { margin-left: 1.05rem; padding-left: 0.62rem; border-left: 1px solid #4a4438; gap: 0.1rem; }
	.empty, .empty-row__text { color: #918c84; font-size: 0.7rem; padding: 0.4rem 0.45rem; }
	.empty strong { color: #d6d0c4; font-size: 0.76rem; }
</style>
