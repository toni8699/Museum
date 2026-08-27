<script lang="ts">
	import { ChevronDown, ChevronRight, ChevronUp, CirclePlay, Diamond, Link, Unlink, X } from 'lucide-svelte';
	import { formatCameraNodeLabel } from './editor-outliner';
	import { getNodeConnections } from './camera/editor-camera-connections';
	import { isFlowNode } from '$lib/content/scene';
	import type { EditorStore } from './editor-store.svelte';

	// optional interactivity gate. The unified tree embeds this panel
	// read-only in Plan (Plan exposes no camera mutation path), so `false` must
	// gate **every** mutation surface, not just clicks: native HTML5 drag
	// (`draggable`, dragstart, the drop gap, "Drag to guided") and the
	// insert/remove buttons all fold into `guidedEditingBlocked` below.
	// The relic never passes the prop and is unchanged.
	let {
		store,
		interactive = true
	}: {
		store: EditorStore;
		interactive?: boolean;
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
		// P11.2 §3 — AP: tour-order edits stay reachable under a playing Director
		// preview (the mutator seam auto-pauses); interaction/pending bars remain.
		!interactive ||
			store.isEditorInteractionActive ||
			store.pendingNavigationCommand !== null
	);
	const previewActionBlocked = $derived(
		!interactive ||
			store.isEditorInteractionActive ||
			store.isDocumentTransactionActive ||
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
	// A two-stop Sequence can be dissolved by deleting its only chain edge;
	// longer chain edges remain protected because they would leave an invalid
	// partial order.
	const finalPairConnectionIds = $derived(
		guidedTourChain.length === 2
			? new Set(chainConnectionRows.map((row) => row.id))
			: new Set<string>()
	);
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

	function toggleNodeNeighbors(nodeId: string) {
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
		event.dataTransfer?.setData('application/x-editor-camera-node', nodeId);
		event.dataTransfer?.setData('text/plain', nodeId);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function finishNodeDrag() {
		draggedNodeId = null;
	}

	function moveNode(nodeId: string, delta: -1 | 1) {
		if (guidedEditingBlocked) return;
		const index = guidedTourChain.indexOf(nodeId);
		if (index < 0) return;
		const destination = index + delta;
		if (destination < 0 || destination >= guidedTourChain.length) return;
		const next = [...guidedTourChain];
		[next[index], next[destination]] = [next[destination]!, next[index]!];
		store.setGuidedTourOrder(next);
	}

	function dropNodeAfter(event: DragEvent, anchorNodeId: string, gapIndex: number) {
		event.preventDefault();
		const nodeId = draggedNodeId ?? event.dataTransfer?.getData('text/plain');
		draggedNodeId = null;
		if (!nodeId || guidedEditingBlocked) return;
		if (guidedTourChain.length === 0) {
			// An empty Sequence has no insertion gap for the strict validator to
			// inspect. Dropping a connected Unsequenced row is the drag equivalent
			// of Start Sequence and seeds the existing two-node pair.
			startSequence(nodeId);
			return;
		}
		if (!guidedTourChain.includes(nodeId)) {
			store.insertNodeIntoGuidedTour(nodeId, gapIndex);
			return;
		}
		// P1.8 D1 — a sequence node dropped at the head gap is a re-root
		// (preserve forward suffix, demote earlier nodes to Unsequenced),
		// not an ordinary reorder.
		if (gapIndex === 0) {
			store.reRootGuidedTour(nodeId);
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

	// P1.9 — the row expansion is a flat sidequest list: directly-connected
	// cameras that are outside the ordered Sequence, outgoing before incoming.
	// Ordered neighbors are already implied by the Sequence rows and must not
	// be repeated in the accordion. Connection detail (direction, key counts,
	// timing) stays in the Connections section / Inspector / Plan edges /
	// Timeline.
	type NeighborRow = { connectionId: string; partnerId: string };

	function directNeighborRowsOf(nodeId: string): NeighborRow[] {
		const { outgoing, incoming } = getNodeConnections(store.document, nodeId);
		return [
			...outgoing.map((row) => ({ connectionId: row.connectionId, partnerId: row.partnerId })),
			...incoming.map((row) => ({ connectionId: row.connectionId, partnerId: row.partnerId }))
		];
	}

	function neighborRowsOf(nodeId: string): NeighborRow[] {
		return directNeighborRowsOf(nodeId).filter(
			(row) => !guidedTourChain.includes(row.partnerId)
		);
	}

	function isNodeSequenced(nodeId: string) {
		return guidedTourChain.includes(nodeId);
	}

	// A node heads an explicit Branch when it carries the serialized branch
	// link (`detourOfNodeId` — schema field stays for back-compat).
	function isBranchHead(nodeId: string) {
		return (
			store.document.navigationNodes.find((candidate) => candidate.id === nodeId)
				?.detourOfNodeId !== undefined
		);
	}

	/**
	 * P1.9 — Unsequenced relationship meta, per Camera-flow-specs §8 graph
	 * truth (never overclaims adjacency): "Neighbor of ⟨camera⟩" only for a
	 * direct edge to a sequenced camera, else "Connected to ⟨camera⟩".
	 * Up to two names, then "+n". Null when there is nothing to claim.
	 */
	function relationshipMeta(nodeId: string): string | null {
		const partners = directNeighborRowsOf(nodeId)
			.map((row) => row.partnerId)
			.filter((partnerId, index, all) => all.indexOf(partnerId) === index);
		if (partners.length === 0) return null;
		const sequenced = partners.filter((partnerId) => isNodeSequenced(partnerId));
		const targets = sequenced.length > 0 ? sequenced : partners;
		const prefix = sequenced.length > 0 ? 'Neighbor of' : 'Connected to';
		const shown = targets.slice(0, 2).map((partnerId) => nodeLabel(partnerId));
		const suffix = targets.length > 2 ? ` +${targets.length - 2}` : '';
		return `${prefix} ${shown.join(', ')}${suffix}`;
	}

	/**
	 * P1.9 — empty-chain promotion eligibility: no flow exists and this
	 * unsequenced camera has at least one direct connection to another
	 * unsequenced (non-branch) camera. Isolated nodes show no affordance.
	 */
	function startSequenceEligible(nodeId: string) {
		if (store.isRelic || guidedTourChain.length > 0) return false;
		const node = store.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		);
		if (!node || isFlowNode(node) || node.detourOfNodeId !== undefined) return false;
		return directNeighborRowsOf(nodeId).some((row) => {
			const partner = store.document.navigationNodes.find(
				(candidate) => candidate.id === row.partnerId
			);
			return (
				partner !== undefined &&
				!isFlowNode(partner) &&
				partner.detourOfNodeId === undefined
			);
		});
	}

	/** Manual pair promotion — one transaction through the mutator. */
	function startSequence(nodeId: string) {
		if (guidedEditingBlocked) return;
		store.startSequenceFromNode(nodeId);
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

	// P3B.5 — preview actions never mutate canonical selection. Sequenced and
	// unsequenced cameras use the same named-node command.
	function previewNode(nodeId: string) {
		if (previewActionBlocked) return;
		store.previewCamera(nodeId, 'visitor');
	}

	function previewCameraUnavailable(nodeId: string) {
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		return !store.isRelic && (node ? isFlowNode(node) : false);
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
	<button
		type="button"
		class="sequence-preview"
		disabled={!store.canStartTourPreview || previewActionBlocked}
		onclick={() => store.previewSequence('director')}
	>Preview Sequence</button>
</div>
{#if guidedTourChain.length > 0}
	<ul role="tree" aria-label="Sequence stops">
		{#if (draggedNodeId || selectedFreeNodeId) && guidedTourChain.length > 0}
			<li
				role="none"
				class="guided-gap guided-gap--head"
				class:guided-gap--dragging={draggedNodeId !== null}
				ondragover={(event) => event.preventDefault()}
				ondrop={(event) => dropNodeAfter(event, '', 0)}
			>
				{#if selectedFreeNodeId}
					{@const selectedFreeNode = store.document.navigationNodes.find(
						(candidate) => candidate.id === selectedFreeNodeId
					)}
					<button
						type="button"
						disabled={guidedEditingBlocked}
						onclick={() => store.insertNodeIntoGuidedTour(selectedFreeNodeId, 0)}
					>
						+ Insert {selectedFreeNode?.label ?? selectedFreeNodeId} first
					</button>
				{:else}
					<span>Drop before first</span>
				{/if}
			</li>
		{/if}
		{#each guidedTourChain as nodeId, index (nodeId)}
			{@const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)}
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
					<div class="guided-line">
					<button
						type="button"
						class="tree-row__chevron"
						aria-label={`${isNodeExpanded(node.id) ? 'Collapse' : 'Expand'} neighbors of ${node.label}`}
						aria-expanded={isNodeExpanded(node.id)}
						aria-disabled={interactive ? undefined : true}
						onclick={interactive ? () => toggleNodeNeighbors(node.id) : undefined}
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
							class="guided-preview"
							aria-label={`Preview ${node.label}`}
							title={previewCameraUnavailable(node.id) ? 'Inspect at Sequence boundary' : 'Preview Camera'}
							disabled={previewActionBlocked || previewCameraUnavailable(node.id)}
							onclick={() => previewNode(node.id)}
						><CirclePlay size={13} aria-hidden="true" /></button>
						<button
							type="button"
							class="guided-reorder"
							aria-label={`Move ${node.label} up`}
							title="Move up"
							disabled={guidedEditingBlocked || index === 0}
							onclick={() => moveNode(node.id, -1)}
						><ChevronUp size={13} aria-hidden="true" /></button>
						<button
							type="button"
							class="guided-reorder"
							aria-label={`Move ${node.label} down`}
							title="Move down"
							disabled={guidedEditingBlocked || index === guidedTourChain.length - 1}
							onclick={() => moveNode(node.id, 1)}
						><ChevronDown size={13} aria-hidden="true" /></button>
						{#if index > 0 && index < guidedTourChain.length - 1 && guidedTourChain.length > 2}
						<button
							type="button"
							class="guided-reroot"
							aria-label={`Set ${node.label} as first`}
							title="Set as First"
							disabled={guidedEditingBlocked}
							onclick={() => store.reRootGuidedTour(node.id)}
						>1</button>
						{/if}
						<button
							type="button"
							class="guided-remove"
							aria-label={`Remove ${node.label} from camera flow`}
							title="Remove from camera flow"
							disabled={guidedEditingBlocked || guidedTourChain.length <= 2}
							onclick={() => store.removeNodeFromGuidedTour(node.id)}
							><X size={13} aria-hidden="true" /></button>
					</div>
				</div>
				{#if isNodeExpanded(node.id)}
					{@const neighbors = neighborRowsOf(node.id)}
					{#if neighbors.length === 0}
						<p class="neighbor-empty">No sidequest cameras</p>
					{:else}
						<ul class="neighbor-list" role="group" aria-label={`Neighbors of ${node.label}`}>
							{#each neighbors as neighbor (neighbor.connectionId)}
								{@const partner = store.document.navigationNodes.find(
									(candidate) => candidate.id === neighbor.partnerId
								)}
								{#if partner}
									<li class="neighbor-line">
										<button
											type="button"
											class="tree-row neighbor-row"
											class:tree-row--selected={isNodeSelected(partner.id)}
											aria-disabled={interactive ? undefined : true}
											onclick={interactive ? () => selectNode(partner.id) : undefined}
										>
											{#if isBranchHead(partner.id)}
												<span class="neighbor-tag">Branch</span>
											{:else}
												<span class="tree-row__diamond" aria-hidden="true"><Diamond size={12} /></span>
											{/if}
											<span class="tree-row__label" title={nodeLabel(partner.id)}>
												{nodeLabel(partner.id)}
											</span>
										</button>
							<button
								type="button"
								class="guided-preview"
								aria-label={`Preview ${partner.label}`}
								title={previewCameraUnavailable(partner.id) ? 'Inspect at Sequence boundary' : 'Preview Camera'}
								disabled={previewActionBlocked || previewCameraUnavailable(partner.id)}
								onclick={() => previewNode(partner.id)}
							><CirclePlay size={13} aria-hidden="true" /></button>
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
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
	<div
		class="guided-gap guided-gap--empty"
		role="group"
		aria-label="Start camera sequence"
		class:guided-gap--dragging={draggedNodeId !== null}
		ondragover={(event) => {
			if (!guidedEditingBlocked) event.preventDefault();
		}}
		ondrop={(event) => dropNodeAfter(event, '', 0)}
	>
		{#if selectedFreeNodeId && startSequenceEligible(selectedFreeNodeId)}
			{@const selectedFreeNode = store.document.navigationNodes.find(
				(candidate) => candidate.id === selectedFreeNodeId
			)}
			<button
				type="button"
				disabled={guidedEditingBlocked}
				onclick={() => startSequence(selectedFreeNodeId)}
			>
				+ Start with {selectedFreeNode?.label ?? selectedFreeNodeId}
			</button>
		{:else}
			<span>Drop a connected Unsequenced camera here to start</span>
		{/if}
	</div>
	{#if freeNodeIds.length > 0}
		<p class="empty">Isolated cameras need a connection before they can start the sequence.</p>
	{/if}
{/if}

{#if detourGroups.length > 0}
	<h3 class="sub-section-header">Branches · {detourGroups.length}</h3>
	<ul role="tree" aria-label="Sequence branches">
		{#each detourGroups as group (group.originNodeId)}
			{@const origin = store.document.navigationNodes.find((node) => node.id === group.originNodeId)}
			<li class="detour-group">
				<div class="detour-head">
					<span class="detour-origin" title={nodeLabel(group.originNodeId)}>
						Branch at {origin?.label ?? nodeLabel(group.originNodeId)}
					</span>
					<button
						type="button"
						class="guided-remove"
						aria-label={`Remove the branch at ${origin?.label ?? group.originNodeId}`}
						title="Remove the whole branch — nodes return to Unsequenced"
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
									aria-label={`Remove ${node.label} from the branch`}
									title="Remove from branch — the camera node returns to Unsequenced"
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
							aria-label={`Add a camera to the branch at ${origin?.label ?? group.originNodeId}`}
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
							aria-label={`${isNodeExpanded(node.id) ? 'Collapse' : 'Expand'} neighbors of ${node.label}`}
							aria-expanded={isNodeExpanded(node.id)}
							aria-disabled={interactive ? undefined : true}
							onclick={interactive ? () => toggleNodeNeighbors(node.id) : undefined}
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
							{#if isBranchHead(node.id)}
								<span class="neighbor-tag">Branch</span>
							{:else if relationshipMeta(node.id)}
								<span class="tree-row__meta">{relationshipMeta(node.id)}</span>
							{:else if guidedTourChain.length > 0}
								<span class="tree-row__meta">Drag to Sequence</span>
							{/if}
						</button>
						<div class="free-actions" aria-label={`Preview ${node.label}`}>
							<button
								type="button"
								class="guided-preview"
								aria-label={`Preview ${node.label}`}
								title={previewCameraUnavailable(node.id) ? 'Inspect at Sequence boundary' : 'Preview Camera'}
								disabled={previewActionBlocked || previewCameraUnavailable(node.id)}
								onclick={() => previewNode(node.id)}
							><CirclePlay size={13} aria-hidden="true" /></button>
							{#if startSequenceEligible(node.id)}
								<button
									type="button"
									class="start-sequence"
									aria-label={`Start the sequence at ${node.label}`}
									title="Start Sequence"
									disabled={guidedEditingBlocked}
									onclick={() => startSequence(node.id)}
								>Start Sequence</button>
							{/if}
						</div>
					</div>
					{#if isNodeExpanded(node.id)}
						{@const neighbors = neighborRowsOf(node.id)}
						{#if neighbors.length === 0}
							<p class="neighbor-empty">No sidequest cameras</p>
						{:else}
							<ul class="neighbor-list" role="group" aria-label={`Neighbors of ${node.label}`}>
								{#each neighbors as neighbor (neighbor.connectionId)}
									{@const partner = store.document.navigationNodes.find(
										(candidate) => candidate.id === neighbor.partnerId
									)}
									{#if partner}
										<li class="neighbor-line">
											<button
												type="button"
												class="tree-row neighbor-row"
												class:tree-row--selected={isNodeSelected(partner.id)}
												aria-disabled={interactive ? undefined : true}
												onclick={interactive ? () => selectNode(partner.id) : undefined}
											>
												{#if isBranchHead(partner.id)}
													<span class="neighbor-tag">Branch</span>
												{:else}
													<span class="tree-row__diamond" aria-hidden="true"><Diamond size={12} /></span>
												{/if}
												<span class="tree-row__label" title={nodeLabel(partner.id)}>
													{nodeLabel(partner.id)}
												</span>
											</button>
										<button
											type="button"
											class="guided-preview"
											aria-label={`Preview ${partner.label}`}
											title={previewCameraUnavailable(partner.id) ? 'Inspect at Sequence boundary' : 'Preview Camera'}
											disabled={previewActionBlocked || previewCameraUnavailable(partner.id)}
											onclick={() => previewNode(partner.id)}
										><CirclePlay size={13} aria-hidden="true" /></button>
										</li>
									{/if}
								{/each}
							</ul>
						{/if}
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
			{@const connection = store.document.connections.find((candidate) => candidate.id === row.id)}
			<li class="unused-row">
				<span class="unused-pair" title={row.id}>
					{nodeLabel(row.fromNodeId)} — {nodeLabel(row.toNodeId)}
				</span>
				{#if unusedRowIds.has(row.id) || finalPairConnectionIds.has(row.id)}
					<button
						type="button"
						class="guided-remove"
						aria-label={
							finalPairConnectionIds.has(row.id)
								? `Delete connection between ${nodeLabel(row.fromNodeId)} and ${nodeLabel(row.toNodeId)} and return both cameras to Unsequenced`
								: `Delete unused connection between ${nodeLabel(row.fromNodeId)} and ${nodeLabel(row.toNodeId)}`
						}
						title={
							finalPairConnectionIds.has(row.id)
								? 'Delete the final sequence connection — both cameras return to Unsequenced'
								: 'Delete this retained connection (its motion is discarded)'
						}
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
		color: var(--editor-text-secondary);
	}
	.sidebar-section-header span {
		flex: 0 0 auto;
		color: var(--editor-text-muted);
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
		grid-template-columns: 1.7rem minmax(0, 1fr) auto;
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
		color: var(--editor-text-muted);
		cursor: pointer;
	}
	.guided-actions button:hover:not(:disabled) {
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
		color: var(--editor-text-primary);
	}
	.guided-actions button.guided-remove {
		color: var(--editor-danger-fg);
	}
	.guided-actions button.guided-reroot {
		color: var(--editor-success);
		font-size: 0.6rem;
		font-weight: 700;
	}
	.guided-actions button.guided-reorder {
		color: var(--editor-accent);
	}
	.guided-actions button.guided-preview,
	.free-actions button.guided-preview {
		color: var(--editor-success);
	}
	.free-actions {
		display: flex;
		align-items: stretch;
		gap: 0.08rem;
	}
	.free-actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.45rem;
		min-height: 2rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: transparent;
		color: var(--editor-text-muted);
		cursor: pointer;
	}
	.free-actions button:hover:not(:disabled) {
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
		color: var(--editor-text-primary);
	}
	.free-actions button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	/* P1.9 — sidequest list (flat, graph truth) + empty-chain promotion. */
	.neighbor-list {
		gap: 0.08rem;
		margin: 0.1rem 0 0.2rem 1.7rem;
		padding-left: 0.55rem;
		border-left: 1px solid var(--editor-border-subtle);
	}
	.neighbor-line {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.1rem;
	}
	.neighbor-row {
		min-height: 1.7rem;
		padding-block: 0.18rem;
	}
	.neighbor-tag {
		flex: 0 0 auto;
		padding: 0.05rem 0.34rem;
		border: 1px solid var(--editor-success-border);
		border-radius: 999px;
		color: var(--editor-success);
		font-size: 0.58rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.neighbor-empty {
		margin: 0.1rem 0 0.2rem 1.7rem;
		color: var(--editor-text-muted);
		font-size: 0.66rem;
	}
	.start-sequence {
		display: inline-flex;
		align-items: center;
		padding: 0.22rem 0.45rem;
		border: 1px solid var(--editor-accent-pressed);
		border-radius: 0.28rem;
		background: var(--editor-bg-control);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.6rem;
		cursor: pointer;
	}
	.start-sequence:hover:not(:disabled) {
		border-color: var(--editor-accent);
		color: var(--editor-text-primary);
	}
	.start-sequence:disabled {
		opacity: 0.25;
		cursor: default;
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
		border: 1px dashed var(--editor-accent-pressed);
		border-radius: 0.25rem;
		background: var(--editor-bg-control);
		color: var(--editor-accent-hover);
		font: inherit;
		font-size: 0.64rem;
		cursor: pointer;
	}
	.guided-gap--empty {
		min-height: 2rem;
		margin: 0.25rem 0;
		padding: 0.2rem;
		border: 1px dashed var(--editor-accent-pressed);
		border-radius: 0.25rem;
		color: var(--editor-accent-border);
		font-size: 0.62rem;
	}
	.guided-gap--empty button {
		width: 100%;
		padding: 0.2rem 0.4rem;
		border: 0;
		background: transparent;
		color: var(--editor-accent-hover);
		font: inherit;
		font-size: 0.64rem;
		cursor: pointer;
	}
	.guided-gap--empty button:hover:not(:disabled) { color: var(--editor-text-primary); }
	.guided-gap--empty button:disabled { opacity: 0.4; cursor: default; }
	.guided-gap--dragging {
		min-height: 1.5rem;
		border: 1px dashed var(--editor-accent-pressed);
		border-radius: 0.25rem;
		color: var(--editor-accent-border);
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
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
	}
	.tree-row--selected {
		border-color: var(--editor-accent-border);
		background: var(--editor-bg-selected);
		box-shadow: inset 0 0 0 1px var(--editor-accent-pressed);
		color: var(--editor-text-primary);
	}
	.tree-row__sequence,
	.tree-row__diamond {
		flex: 0 0 1.25rem;
		color: var(--editor-text-muted);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	.tree-row__diamond {
		color: var(--editor-accent);
	}
	.tree-row--selected .tree-row__diamond {
		color: var(--editor-text-primary);
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
		color: var(--editor-text-muted);
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
	}
	.tree-row--selected .tree-row__meta {
		color: var(--editor-text-primary);
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
		color: var(--editor-accent);
		cursor: pointer;
	}
	.tree-row__chevron:hover {
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
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
		color: var(--editor-text-muted);
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
	.empty strong {
		color: var(--editor-text-secondary);
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
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.32rem;
		background: var(--editor-bg-panel-raised);
	}
	.loop-readout {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.3rem;
		color: var(--editor-text-secondary);
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.loop-readout strong {
		color: var(--editor-text-primary);
		font-weight: 650;
	}
	.loop-duration {
		color: var(--editor-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.loop-action {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex: 0 0 auto;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--editor-accent-pressed);
		border-radius: 0.28rem;
		background: var(--editor-bg-control);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.62rem;
		cursor: pointer;
	}
	.loop-action:hover:not(:disabled) {
		border-color: var(--editor-accent);
		color: var(--editor-text-primary);
	}
	.loop-action:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.sub-section-header {
		margin: 0.45rem 0 0.2rem;
		padding: 0 0.45rem;
		color: var(--editor-accent-hover);
		font-size: 0.66rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.detour-group {
		border: 1px solid var(--editor-border-subtle);
		border-radius: 0.32rem;
		background: var(--editor-bg-panel);
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
		color: var(--editor-text-secondary);
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
		color: var(--editor-success);
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
		color: var(--editor-danger-fg);
		cursor: pointer;
	}
	.detour-remove:hover:not(:disabled) {
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
		color: var(--editor-danger-fg);
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
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.28rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.64rem;
	}
	.detour-add button {
		padding: 0.26rem 0.5rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.28rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.64rem;
		cursor: pointer;
	}
	.detour-add button:hover:not(:disabled) {
		border-color: var(--editor-accent);
		color: var(--editor-text-primary);
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
		border: 1px solid var(--editor-border-subtle);
		border-radius: 0.28rem;
		background: var(--editor-bg-panel);
	}
	.unused-pair {
		min-width: 0;
		overflow: hidden;
		color: var(--editor-text-secondary);
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
		color: var(--editor-danger-fg);
		cursor: pointer;
	}
	.unused-row .guided-remove:hover:not(:disabled) {
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-control);
		color: var(--editor-danger-fg);
	}
	.unused-row .guided-remove:disabled {
		opacity: 0.25;
		cursor: default;
	}
</style>
