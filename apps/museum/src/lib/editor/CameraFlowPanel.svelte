<script lang="ts">
	import { ArrowDown, ArrowUp, ChevronRight, Diamond, Link, Unlink, X } from 'lucide-svelte';
	import NodeConnectionsPanel from './NodeConnectionsPanel.svelte';
	import { formatCameraNodeLabel } from './editor-outliner';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	// optional interactivity gate. The unified tree embeds this panel
	// read-only in Plan (Plan exposes no camera mutation path), so `false` must
	// gate **every** mutation surface, not just clicks: native HTML5 drag
	// (`draggable`, dragstart, the drop gap, "Drag to guided") and the
	// move/insert/remove buttons all fold into `guidedEditingBlocked` below.
	// The relic never passes the prop and is unchanged.
	let {
		store,
		interactive = true,
		activeDomain = null
	}: {
		store: MuseumEditorStore;
		interactive?: boolean;
		// the S3 active selection domain, forwarded to
		// NodeConnectionsPanel so its discovery-driven direction highlight is
		// gated to camera-or-none. The relic never passes it and keeps the
		// legacy selection-gated behavior.
		activeDomain?: 'layout' | 'scene' | 'camera' | 'none' | null;
	} = $props();

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
		!interactive ||
			store.isDocumentMutationBlocked ||
			store.isEditorInteractionActive ||
			store.pendingNavigationCommand !== null
	);

	// S10.1.3 — Sequence Inspector: the derived loop row (distinct-connection
	// test) and the detour groups render from the store's flow accessors.
	const flowLoopConnectionId = $derived(store.flowLoopConnectionId);
	const detourGroups = $derived(store.flowDetourGroups);
	const chainHeadNodeId = $derived(guidedTourChain[0]);
	const chainTailNodeId = $derived(guidedTourChain.at(-1));
	const flowHasLoop = $derived(flowLoopConnectionId !== null);
	// The loop row never renders for N < 3: a two-node pair never loops (its
	// only record is also its chain transition — T5/T8), and the S10.2
	// contract pins the readout to N ≥ 3 (T7's "Stops at" / "Loops via").
	const showLoopRow = $derived(guidedTourChain.length >= 3);
	const loopDurationSeconds = $derived.by(() => {
		if (!flowLoopConnectionId) return null;
		const connection = store.document.connections.find(
			(candidate) => candidate.id === flowLoopConnectionId
		);
		const timing = connection?.timing?.forward;
		return typeof timing?.durationSeconds === 'number' ? timing.durationSeconds : null;
	});
	// Connections section (canonical sidebar): every connection appears exactly
	// once — the sequence's chain-transition records plus the retained tray.
	// Labels stay undirected (`A — B`, never `→`); the derived loop record
	// lives in the loop row. Chain records are sequence-required (no delete);
	// retained rows stay deletable.
	const unusedConnectionRows = $derived.by(() => {
		const chainRecords = new Set<string>();
		for (let index = 0; index + 1 < guidedTourChain.length; index += 1) {
			const fromId = guidedTourChain[index];
			const toId = guidedTourChain[index + 1];
			const record = store.document.connections.find(
				(candidate) =>
					(candidate.fromNodeId === fromId && candidate.toNodeId === toId) ||
					(candidate.fromNodeId === toId && candidate.toNodeId === fromId)
			);
			if (record) chainRecords.add(record.id);
		}
		return store.document.connections
			.filter(
				(connection) =>
					!chainRecords.has(connection.id) && connection.id !== flowLoopConnectionId
			)
			.map((connection) => ({
				id: connection.id,
				fromNodeId: connection.fromNodeId,
				toNodeId: connection.toNodeId
			}));
	});
	const chainConnectionRows = $derived.by(() => {
		const rows: Array<{ id: string; fromNodeId: string; toNodeId: string }> = [];
		for (let index = 0; index + 1 < guidedTourChain.length; index += 1) {
			const fromId = guidedTourChain[index];
			const toId = guidedTourChain[index + 1];
			const record = store.document.connections.find(
				(candidate) =>
					(candidate.fromNodeId === fromId && candidate.toNodeId === toId) ||
					(candidate.fromNodeId === toId && candidate.toNodeId === fromId)
			);
			if (record) {
				rows.push({
					id: record.id,
					fromNodeId: record.fromNodeId,
					toNodeId: record.toNodeId
				});
			}
		}
		return rows;
	});
	const unusedRowIds = $derived(new Set(unusedConnectionRows.map((row) => row.id)));
	const connectionRows = $derived([...chainConnectionRows, ...unusedConnectionRows]);

	let draggedNodeId = $state<string | null>(null);
	let expandedNodeIds = $state<string[]>([]);
	// Per-detour "add free node" selection, keyed by origin node id.
	let detourAddSelection = $state<Record<string, string>>({});

	function isNodeSelected(nodeId: string) {
		return (
			store.navigationSelection?.kind === 'node' &&
			store.navigationSelection.nodeId === nodeId
		);
	}

	function isNodeExpanded(nodeId: string) {
		return expandedNodeIds.includes(nodeId);
	}

	function toggleNodeConnections(nodeId: string) {
		if (expandedNodeIds.includes(nodeId)) {
			expandedNodeIds = expandedNodeIds.filter((id) => id !== nodeId);
			return;
		}
		expandedNodeIds = [...expandedNodeIds, nodeId];
	}

	function expandNode(nodeId: string) {
		if (!expandedNodeIds.includes(nodeId)) {
			expandedNodeIds = [...expandedNodeIds, nodeId];
		}
	}

	function selectNode(nodeId: string) {
		expandNode(nodeId);
		store.selectionActions.selectNavigationNode(nodeId);
	}

	$effect(() => {
		const selection = store.navigationSelection;
		if (selection?.kind === 'node') {
			expandNode(selection.nodeId);
			return;
		}
		if (
			selection?.kind === 'connection' ||
			selection?.kind === 'anchor' ||
			selection?.kind === 'view-keyframe'
		) {
			const connection = store.document.connections.find(
				(candidate) => candidate.id === selection.connectionId
			);
			if (!connection) return;
			const focusNodeId =
				store.activeCameraDirection === 'reverse'
					? connection.toNodeId
					: connection.fromNodeId;
			expandNode(focusNodeId);
		}
	});

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

	function nodeLabel(nodeId: string) {
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		return node ? formatCameraNodeLabel(node.label, node.id) : nodeId;
	}

	// S10.1.3 — Sequence Inspector actions: [Disconnect Loop] is a plain
	// connection deletion; [+ Connect to [head]] selects the tail and starts
	// the ordinary connect-existing flow (never a Close-loop mutation).
	function disconnectLoop() {
		if (!flowLoopConnectionId || guidedEditingBlocked) return;
		store.deleteConnection(flowLoopConnectionId);
	}

	function connectTailToHead() {
		if (!chainTailNodeId || guidedEditingBlocked) return;
		store.selectionActions.selectNavigationNode(chainTailNodeId);
		store.beginConnectExistingNodes();
	}

	function appendDetourNode(originNodeId: string) {
		const newNodeId = detourAddSelection[originNodeId];
		if (!newNodeId || guidedEditingBlocked) return;
		store.appendDetourNode(originNodeId, newNodeId);
		detourAddSelection = { ...detourAddSelection, [originNodeId]: '' };
	}
</script>

<div class="sidebar-section-header">
	<h2>Sequence Inspector</h2>
	<span aria-label={`${guidedTourChain.length} sequence stops`}>{guidedTourChain.length}</span>
</div>
{#if guidedTourChain.length > 0}
	<ul role="tree" aria-label="Sequence stops">
		{#each guidedTourChain as nodeId, index (nodeId)}
			{@const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)}
			{#if node}
				<li
					role="treeitem"
					aria-expanded={isNodeExpanded(node.id)}
					aria-selected={isNodeSelected(node.id)}
					aria-grabbed={draggedNodeId === node.id}
					aria-disabled={interactive ? undefined : true}
					draggable={index > 0 && !guidedEditingBlocked}
					ondragstart={(event) => beginNodeDrag(event, node.id)}
					ondragend={finishNodeDrag}
				>
					<div class="guided-line">
						<button
							type="button"
							class="tree-row__chevron"
							aria-label={`${isNodeExpanded(node.id) ? 'Collapse' : 'Expand'} connections for ${node.label}`}
							aria-expanded={isNodeExpanded(node.id)}
							aria-disabled={interactive ? undefined : true}
							onclick={interactive ? () => toggleNodeConnections(node.id) : undefined}
						>
							<span class="chevron" class:open={isNodeExpanded(node.id)} aria-hidden="true"><ChevronRight size={14} /></span>
						</button>
						<button
							type="button"
							class="tree-row"
							class:tree-row--selected={isNodeSelected(node.id)}
							aria-disabled={interactive ? undefined : true}
							onclick={interactive ? () => selectNode(node.id) : undefined}
						>
							<span class="tree-row__sequence" aria-hidden="true">
								{String(index + 1).padStart(2, '0')}
							</span>
							<span class="tree-row__label" title={nodeLabel(node.id)}>
								{nodeLabel(node.id)}
							</span>
							{#if index === 0}<span class="tree-row__meta">Start</span>{/if}
						</button>
						<div class="guided-actions" aria-label={`Edit ${node.label} flow order`}>
							<button
								type="button"
								aria-label={`Move ${node.label} earlier`}
								title="Move earlier"
								disabled={guidedEditingBlocked || index <= 1}
								onclick={() => moveGuidedNode(node.id, -1)}
							><ArrowUp size={13} aria-hidden="true" /></button>
							<button
								type="button"
								aria-label={`Move ${node.label} later`}
								title="Move later"
								disabled={guidedEditingBlocked || index === 0 || index >= guidedTourChain.length - 1}
								onclick={() => moveGuidedNode(node.id, 1)}
							><ArrowDown size={13} aria-hidden="true" /></button>
							<button
								type="button"
								class="guided-remove"
								aria-label={`Remove ${node.label} from camera flow`}
								title={index === 0 ? 'Flow start is pinned' : 'Remove from camera flow'}
								disabled={guidedEditingBlocked || index === 0 || guidedTourChain.length <= 2}
								onclick={() => store.removeNodeFromGuidedTour(node.id)}
							><X size={13} aria-hidden="true" /></button>
						</div>
					</div>
					{#if isNodeExpanded(node.id)}
						<NodeConnectionsPanel
							{store}
							nodeId={node.id}
							interactive={interactive}
							{activeDomain}
						/>
					{/if}
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
							<span>Drop between route steps</span>
						{/if}
					</li>
				{/if}
			{/if}
		{/each}
	</ul>

	{#if showLoopRow}
		<div class="loop-row" aria-label="Derived loop state">
			{#if flowHasLoop}
				<span class="loop-readout">
					<strong>Loops via:</strong> {nodeLabel(chainTailNodeId!)} → {nodeLabel(chainHeadNodeId!)}
					{#if loopDurationSeconds !== null}
						<span class="loop-duration">({loopDurationSeconds.toFixed(1)}s)</span>
					{/if}
				</span>
				<button
					type="button"
					class="loop-action"
					disabled={guidedEditingBlocked}
					title="Delete the closing connection — playback reverts to stopping at the tail"
					onclick={disconnectLoop}
				><Unlink size={13} aria-hidden="true" /> Disconnect Loop</button>
			{:else}
				<span class="loop-readout">
					<strong>Stops at</strong> {nodeLabel(chainTailNodeId!)}
				</span>
				<button
					type="button"
					class="loop-action"
					disabled={guidedEditingBlocked}
					title="Connect the last node back to the first — the path then loops"
					onclick={connectTailToHead}
				><Link size={13} aria-hidden="true" /> Connect to {nodeLabel(chainHeadNodeId!)}</button>
			{/if}
		</div>
	{/if}
{:else}
	<p class="empty"><strong>No sequence</strong></p>
	<p class="empty">Place and connect camera nodes to build the path.</p>
{/if}

{#if detourGroups.length > 0}
	<h3 class="sub-section-header">Detours · {detourGroups.length}</h3>
	<ul role="tree" aria-label="Sequence detours">
		{#each detourGroups as group (group.originNodeId)}
			{@const origin = store.document.navigationNodes.find((node) => node.id === group.originNodeId)}
			<li class="detour-group">
				<div class="detour-head">
					<span class="detour-origin" title={nodeLabel(group.originNodeId)}>
						Detour at {origin?.label ?? nodeLabel(group.originNodeId)}
					</span>
					<button
						type="button"
						class="guided-remove"
						aria-label={`Remove the detour at ${origin?.label ?? group.originNodeId}`}
						title="Remove the whole detour — nodes are kept as free"
						disabled={guidedEditingBlocked}
						onclick={() => store.removeDetour(group.originNodeId)}
					><X size={13} aria-hidden="true" /></button>
				</div>
				<ul class="detour-chain">
					{#each group.chainNodeIds as nodeId, index (nodeId)}
						{@const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)}
						{#if node}
							<li>
								<button
									type="button"
									class="tree-row detour-row"
									class:tree-row--selected={isNodeSelected(node.id)}
									aria-disabled={interactive ? undefined : true}
									onclick={interactive ? () => selectNode(node.id) : undefined}
								>
									<span class="tree-row__sequence" aria-hidden="true">
										{String(index + 1).padStart(2, '0')}
									</span>
									<span class="tree-row__label" title={nodeLabel(node.id)}>
										{nodeLabel(node.id)}
									</span>
								</button>
								<button
									type="button"
									class="detour-remove"
									aria-label={`Remove ${node.label} from the detour`}
									title="Remove from detour — the camera node is kept as free"
									disabled={guidedEditingBlocked}
									onclick={() => store.removeDetourNode(group.originNodeId, node.id)}
								><X size={13} aria-hidden="true" /></button>
							</li>
						{/if}
					{/each}
				</ul>
				{#if freeNodeIds.length > 0}
					<div class="detour-add">
						<select
							aria-label={`Add a node to the detour at ${origin?.label ?? group.originNodeId}`}
							disabled={guidedEditingBlocked}
							value={detourAddSelection[group.originNodeId] ?? ''}
							onchange={(event) =>
								(detourAddSelection = {
									...detourAddSelection,
									[group.originNodeId]: event.currentTarget.value
								})}
						>
							<option value="">Add node…</option>
							{#each freeNodeIds as freeId (freeId)}
								<option value={freeId}>{nodeLabel(freeId)}</option>
							{/each}
						</select>
						<button
							type="button"
							disabled={guidedEditingBlocked || !detourAddSelection[group.originNodeId]}
							onclick={() => appendDetourNode(group.originNodeId)}
						>Add</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if freeNodeIds.length > 0}
	<div class="sidebar-section-header">
		<h2>Unsequenced</h2>
		<span aria-label={`${freeNodeIds.length} unsequenced cameras`}>{freeNodeIds.length}</span>
	</div>
	<ul role="tree" aria-label="Unsequenced cameras">
		{#each freeNodeIds as nodeId (nodeId)}
			{@const node = store.document.navigationNodes.find(
				(candidate) => candidate.id === nodeId
			)}
			{#if node}
				<li
					role="treeitem"
					aria-expanded={isNodeExpanded(node.id)}
					aria-selected={isNodeSelected(node.id)}
					aria-grabbed={draggedNodeId === node.id}
					aria-disabled={interactive ? undefined : true}
					draggable={!guidedEditingBlocked}
					ondragstart={(event) => beginNodeDrag(event, node.id)}
					ondragend={finishNodeDrag}
				>
					<div class="free-line">
						<button
							type="button"
							class="tree-row__chevron"
							aria-label={`${isNodeExpanded(node.id) ? 'Collapse' : 'Expand'} connections for ${node.label}`}
							aria-expanded={isNodeExpanded(node.id)}
							aria-disabled={interactive ? undefined : true}
							onclick={interactive ? () => toggleNodeConnections(node.id) : undefined}
						>
							<span class="chevron" class:open={isNodeExpanded(node.id)} aria-hidden="true"><ChevronRight size={14} /></span>
						</button>
						<button
							type="button"
							class="tree-row"
							class:tree-row--selected={isNodeSelected(node.id)}
							aria-disabled={interactive ? undefined : true}
							onclick={interactive ? () => selectNode(node.id) : undefined}
						>
							<span class="tree-row__diamond" aria-hidden="true"><Diamond size={12} /></span>
							<span class="tree-row__label" title={nodeLabel(node.id)}>
								{nodeLabel(node.id)}
							</span>
							<span class="tree-row__meta">Drag to sequence</span>
						</button>
					</div>
					{#if isNodeExpanded(node.id)}
						<NodeConnectionsPanel
							{store}
							nodeId={node.id}
							interactive={interactive}
							{activeDomain}
						/>
					{/if}
				</li>
			{/if}
		{/each}
	</ul>
{/if}

{#if connectionRows.length > 0}
	<div class="sidebar-section-header">
		<h2>Connections</h2>
		<span aria-label={`${connectionRows.length} connections`}>{connectionRows.length}</span>
	</div>
	<ul role="tree" aria-label="Camera connections">
		{#each connectionRows as row (row.id)}
			<li class="unused-row">
				<span class="unused-pair" title={row.id}>
					{nodeLabel(row.fromNodeId)} — {nodeLabel(row.toNodeId)}
				</span>
				{#if unusedRowIds.has(row.id)}
					<button
						type="button"
						class="guided-remove"
						aria-label={`Delete unused connection between ${nodeLabel(row.fromNodeId)} and ${nodeLabel(row.toNodeId)}`}
						title="Delete this retained connection (its motion is discarded)"
						disabled={guidedEditingBlocked}
						onclick={() => store.deleteConnection(row.id)}
					><X size={13} aria-hidden="true" /></button>
				{/if}
			</li>
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
		grid-template-columns: 1.7rem minmax(0, 1fr) auto;
		gap: 0.1rem;
	}
	.free-line {
		display: grid;
		min-width: 0;
		grid-template-columns: 1.7rem minmax(0, 1fr);
		gap: 0.1rem;
	}
	.guided-actions {
		display: flex;
		align-items: stretch;
		gap: 0.08rem;
	}
	.guided-actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
	.tree-row__chevron {
		display: grid;
		width: 1.7rem;
		min-height: 2rem;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: #d6b35f;
		cursor: pointer;
	}
	.tree-row__chevron:hover {
		border-color: #3a3a46;
		background: #202029;
	}
	.chevron {
		display: block;
		font-size: 1rem;
		line-height: 1;
		transform: rotate(0);
		transition: transform 120ms ease;
	}
	.chevron.open {
		transform: rotate(90deg);
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

	/* S10.1.3 — Sequence Inspector loop row + detours + unused tray. */
	.loop-row {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.35rem;
		padding: 0.42rem 0.5rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
	}
	.loop-readout {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.3rem;
		color: #c9c3b8;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.loop-readout strong {
		color: #fff2c7;
		font-weight: 650;
	}
	.loop-duration {
		color: #918c84;
		font-variant-numeric: tabular-nums;
	}
	.loop-action {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex: 0 0 auto;
		padding: 0.3rem 0.45rem;
		border: 1px solid #6f5c31;
		border-radius: 0.28rem;
		background: #211e15;
		color: #e8d5a3;
		font: inherit;
		font-size: 0.62rem;
		cursor: pointer;
	}
	.loop-action:hover:not(:disabled) {
		border-color: #d6b35f;
		color: #fff2c7;
	}
	.loop-action:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.sub-section-header {
		margin: 0.45rem 0 0.2rem;
		padding: 0 0.45rem;
		color: #a89a72;
		font-size: 0.66rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.detour-group {
		border: 1px solid #33333e;
		border-radius: 0.32rem;
		background: #15151c;
		padding: 0.3rem;
	}
	.detour-head {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.2rem 0.3rem;
	}
	.detour-origin {
		min-width: 0;
		overflow: hidden;
		color: #d6c7a8;
		font-size: 0.68rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.detour-chain {
		gap: 0.08rem;
	}
	.detour-chain li {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.15rem;
	}
	.detour-row {
		min-height: 1.7rem;
		padding-block: 0.18rem;
	}
	.detour-row .tree-row__sequence {
		color: #8fae8a;
	}
	.detour-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		min-height: 1.7rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		color: #c9877f;
		cursor: pointer;
	}
	.detour-remove:hover:not(:disabled) {
		border-color: #3a3a46;
		background: #202029;
		color: #ffb3a8;
	}
	.detour-remove:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.detour-add {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.3rem;
		padding: 0.3rem 0.3rem 0.15rem;
	}
	.detour-add select {
		min-width: 0;
		padding: 0.26rem 0.35rem;
		border: 1px solid #3a3a46;
		border-radius: 0.28rem;
		background: #1a1a22;
		color: #ddd6ca;
		font: inherit;
		font-size: 0.64rem;
	}
	.detour-add button {
		padding: 0.26rem 0.5rem;
		border: 1px solid #3a3a46;
		border-radius: 0.28rem;
		background: #1a1a22;
		color: #ddd6ca;
		font: inherit;
		font-size: 0.64rem;
		cursor: pointer;
	}
	.detour-add button:hover:not(:disabled) {
		border-color: #d6b35f;
		color: #fff2c7;
	}
	.detour-add button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.unused-row {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.3rem;
		border: 1px solid #2e2e38;
		border-radius: 0.28rem;
		background: #14141a;
	}
	.unused-pair {
		min-width: 0;
		overflow: hidden;
		color: #a8a29a;
		font-size: 0.66rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.unused-row .guided-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		min-height: 1.5rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		color: #c9877f;
		cursor: pointer;
	}
	.unused-row .guided-remove:hover:not(:disabled) {
		border-color: #3a3a46;
		background: #202029;
		color: #ffb3a8;
	}
	.unused-row .guided-remove:disabled {
		opacity: 0.25;
		cursor: default;
	}
</style>
