<script lang="ts">
	import { formatCameraNodeLabel } from './editor-outliner';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

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
		event.dataTransfer?.setData('application/x-museum-camera-node', nodeId);
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
							onclick={() => store.selectionActions.selectNavigationNode(node.id)}
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
						onclick={() => store.selectionActions.selectNavigationNode(node.id)}
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

<style>
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
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.02em;
		color: #d6c7a8;
	}
	.sidebar-section-header span {
		flex: 0 0 auto;
		color: #918c84;
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
	}
	ul {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.12rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.guided-line {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.16rem;
	}
	.guided-actions {
		display: flex;
		align-items: stretch;
		gap: 0.08rem;
	}
	.guided-actions button {
		width: 1.45rem;
		min-height: 2rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		color: #aaa39a;
		cursor: pointer;
	}
	.guided-actions button:hover:not(:disabled) {
		border-color: #3a3a46;
		background: #202029;
		color: #fff2c7;
	}
	.guided-actions button.guided-remove {
		color: #c9877f;
	}
	.guided-actions button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.guided-gap {
		display: flex;
		min-height: 0.35rem;
		align-items: center;
		justify-content: center;
	}
	.guided-gap button {
		width: 100%;
		padding: 0.2rem 0.4rem;
		border: 1px dashed #6f5c31;
		border-radius: 0.25rem;
		background: #211e15;
		color: #d9c27f;
		font: inherit;
		font-size: 0.64rem;
		cursor: pointer;
	}
	.guided-gap--dragging {
		min-height: 1.5rem;
		border: 1px dashed #6f5c31;
		border-radius: 0.25rem;
		color: #9f8c5b;
		font-size: 0.62rem;
	}
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
		cursor: pointer;
	}
	.tree-row:hover {
		border-color: #3a3a46;
		background: #202029;
	}
	.tree-row--selected {
		border-color: #8d753c;
		background: #2a2618;
		box-shadow: inset 0 0 0 1px #6f5c31;
		color: #fff2c7;
	}
	.tree-row__sequence,
	.tree-row__diamond {
		flex: 0 0 1.25rem;
		color: #918c84;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	.tree-row__diamond {
		color: #d6b35f;
	}
	.tree-row--selected .tree-row__diamond {
		color: #fff2c7;
	}
	.tree-row__label {
		min-width: 0;
		overflow: hidden;
		font-size: 0.74rem;
		font-weight: 570;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tree-row__meta {
		min-width: 0;
		margin-left: auto;
		color: #918c84;
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
	}
	.tree-row--selected .tree-row__meta {
		color: #e8d5a3;
	}
	.empty {
		color: #918c84;
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
	.empty strong {
		color: #d6d0c4;
		font-size: 0.76rem;
	}
</style>
