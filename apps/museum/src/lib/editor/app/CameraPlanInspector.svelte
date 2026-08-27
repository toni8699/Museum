<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/scene';
	import { isFlowNode } from '$lib/content/scene';
	import type { EditorStore } from '../editor-store.svelte';
	import EditorNumberField from '../fields/EditorNumberField.svelte';
	import { getNodeConnections } from '../camera/editor-camera-connections';
	import { formatCameraNodeLabel } from '../editor-outliner';
	import { getScenePathAnchorWorldPosition } from '../camera/editor-camera-path';
	import { resolvePlanSceneGraphFromDocument } from '../layout/plan-camera-projection';
	import EditorCameraConnectionTiming from '../camera/EditorCameraConnectionTiming.svelte';
	import type { EditorViewState } from './editor-view-state.svelte';

	let {
		store,
		viewState = null
	}: { store: EditorStore; viewState?: EditorViewState | null } = $props();

	const selection = $derived(store.navigationSelection);
	const node = $derived(store.selectedNavigationNode);
	const connection = $derived(store.selectedConnection);
	const anchor = $derived(store.selectedAnchor);
	const viewKeyframe = $derived(store.selectedViewKeyframe);
	const mainFlowNodeIds = $derived(store.mainFlowNodeIds);
	const nodeOrder = $derived(
		node && selection?.kind === 'node'
			? mainFlowNodeIds.indexOf(node.id) + 1
			: null
	);
	const nodeOnSequence = $derived(node ? !store.isRelic && isFlowNode(node) : false);
	const graph = $derived.by(() => {
		try {
			return resolvePlanSceneGraphFromDocument(store.document, store.rooms);
		} catch {
			// scene/layout divergence: timing metrics degrade to unavailable.
			return null;
		}
	});
	const fromNode = $derived(
		connection
			? store.document.navigationNodes.find(
					(candidate) => candidate.id === connection.fromNodeId
			  )
			: undefined
	);
	const toNode = $derived(
		connection
			? store.document.navigationNodes.find(
					(candidate) => candidate.id === connection.toNodeId
			  )
			: undefined
	);
	const nodeConnections = $derived(
		node && selection?.kind === 'node'
			? getNodeConnections(store.document, node.id)
			: null
	);
	const partnerLabels = $derived(
		new Map(
			store.document.navigationNodes.map((candidate) => [
				candidate.id,
				formatCameraNodeLabel(candidate.label, candidate.id)
			])
		)
	);
	const nodeWorld = $derived(
		node && selection?.kind === 'node'
			? store.rooms.point(node.roomId, node.position)
			: null
	);
	const anchorWorld = $derived(
		anchor && selection?.kind === 'anchor'
			? getScenePathAnchorWorldPosition(anchor, store.rooms)
			: null
	);

	let timingDirection = $state<CameraConnectionDirection>('forward');
	$effect(() => {
		if (selection?.kind === 'connection') {
			timingDirection = store.activeCameraDirection;
		}
	});

	let labelDraft = $state('');
	$effect(() => {
		labelDraft = node?.label ?? '';
	});

	function saveLabel() {
		if (!node) return;
		if (!store.commitSelectedNodeLabel(labelDraft)) labelDraft = node.label;
	}

	function onLabelKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveLabel();
		} else if (event.key === 'Escape' && node) {
			event.preventDefault();
			event.stopPropagation();
			labelDraft = node.label;
		}
	}

	function commitNodeXZ(x: number, z: number) {
		const current = nodeWorld;
		if (!node || !current || !Number.isFinite(x) || !Number.isFinite(z)) return;
		const local = store.rooms.localPoint(node.roomId, [x, current[1], z]);
		store.commitNavigationNodePoint(node.id, 'position', local);
	}

	function commitAnchorXZ(x: number, z: number) {
		const current = anchorWorld;
		if (selection?.kind !== 'anchor' || !current) return;
		if (!Number.isFinite(x) || !Number.isFinite(z)) return;
		if (!store.beginDocumentTransaction()) return;
		if (
			!store.updateConnectionAnchorWorldPoint(
				selection.connectionId,
				selection.anchorId,
				[x, current[1], z]
			)
		) {
			store.cancelDocumentTransaction();
			return;
		}
		store.commitDocumentTransaction();
	}

	function commitDuration(value: number) {
		if (!connection || selection?.kind !== 'connection') return;
		const timing = connection.timing?.[timingDirection];
		store.setConnectionTiming(connection.id, timingDirection, {
			durationSeconds: value,
			...(timing?.easing !== undefined ? { easing: timing.easing } : {})
		});
	}

	function useAutomatic() {
		if (!connection || selection?.kind !== 'connection') return;
		const timing = connection.timing?.[timingDirection];
		if (!timing) return;
		if (timing.easing !== undefined) {
			store.setConnectionTiming(connection.id, timingDirection, {
				easing: timing.easing
			});
		} else {
			store.setConnectionTiming(connection.id, timingDirection, null);
		}
	}

	function selectDirection(direction: CameraConnectionDirection) {
		if (!connection) return;
		store.selectionActions.selectCameraConnectionDirection(
			connection.id,
			direction
		);
	}
</script>

{#if selection?.kind === 'node' && node && nodeWorld}
	<section class="camera-plan-panel" aria-label="Camera Plan node editor">
		<div class="section-heading">
			<h2>Camera node</h2>
			<span>Room-local</span>
		</div>

		<label class="label-field">
			<span>Label</span>
			<input
				bind:value={labelDraft}
				disabled={store.isAuthoringPauseBlocked}
				onblur={saveLabel}
				onkeydown={onLabelKeyDown}
			/>
		</label>

		<dl>
			<div><dt>Node</dt><dd class="id">{node.id}</dd></div>
			<div><dt>Room</dt><dd>{node.roomId}</dd></div>
			<div>
				<dt>Flow order</dt>
				<dd>
					{#if nodeOrder !== null}
						<span class="order-badge">#{nodeOrder}</span>
					{:else}
						<span class="unsequenced-badge">Unsequenced</span>
					{/if}
				</dd>
			</div>
		</dl>

		{#key node.id}
			<div class="xz-fields" aria-label="Camera node world position">
				<EditorNumberField
					label="World X (m)"
					value={nodeWorld[0]}
					step={0.01}
					fractionDigits={3}
					oncommit={(x) => commitNodeXZ(x, nodeWorld[1])}
				/>
				<EditorNumberField
					label="World Z (m)"
					value={nodeWorld[1]}
					step={0.01}
					fractionDigits={3}
					oncommit={(z) => commitNodeXZ(nodeWorld[0], z)}
				/>
			</div>
		{/key}

		{#if nodeConnections}
			<section class="connections" aria-label="Node connections">
				<div class="section-heading">
					<h3>Connections</h3>
					<span>{nodeConnections.outgoing.length + nodeConnections.incoming.length}</span>
				</div>
				{#if nodeConnections.outgoing.length === 0 && nodeConnections.incoming.length === 0}
					<p class="connections-empty">No connections</p>
				{:else}
					<ul class="connection-list">
						{#each nodeConnections.outgoing as row (row.connectionId)}
							<li class="connection-row outgoing">
								<span class="badge" aria-hidden="true">▶</span>
								<span class="partner" title={partnerLabels.get(row.partnerId) ?? row.partnerId}>
									{partnerLabels.get(row.partnerId) ?? row.partnerId}
								</span>
								{#if row.partnerRoomId !== node.roomId}
									<span class="room">{row.partnerRoomId}</span>
								{/if}
								<span class="meta">{row.anchorsCount} anchors</span>
							</li>
						{/each}
						{#each nodeConnections.incoming as row (row.connectionId)}
							<li class="connection-row incoming">
								<span class="badge" aria-hidden="true">◀</span>
								<span class="partner" title={partnerLabels.get(row.partnerId) ?? row.partnerId}>
									{partnerLabels.get(row.partnerId) ?? row.partnerId}
								</span>
								{#if row.partnerRoomId !== node.roomId}
									<span class="room">{row.partnerRoomId}</span>
								{/if}
								<span class="meta">{row.anchorsCount} anchors</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<div class="topology" aria-label="Camera topology commands">
			<button
				type="button"
				disabled={nodeOnSequence || store.isDocumentTransactionActive || store.isEditorInteractionActive || store.pendingNavigationCommand !== null}
				title={nodeOnSequence ? 'Inspect at Sequence boundary' : 'Preview Camera'}
				onclick={() => { viewState?.setView('camera', '3d'); store.previewCamera(node.id, 'visitor'); }}
			>Preview Camera</button>
			<button
				type="button"
				disabled={store.isAuthoringPauseBlocked}
				onclick={() => store.beginConnectExistingNodes()}
			>Connect to another node</button>
			<button
				type="button"
				class="danger"
				disabled={store.isAuthoringPauseBlocked}
				onclick={() => store.deleteNavigationNode(node.id)}
			>Delete camera node</button>
		</div>
	</section>
{:else if selection?.kind === 'connection' && connection}
	<section class="camera-plan-panel" aria-label="Camera Plan connection editor">
		<div class="section-heading">
			<h2>Camera connection</h2>
			<span>{connection.positionPath.kind}</span>
		</div>
		<dl>
			<div><dt>Connection</dt><dd class="id">{connection.id}</dd></div>
			<div><dt>From</dt><dd>{formatCameraNodeLabel(fromNode?.label, connection.fromNodeId)}<small class="id">{connection.fromNodeId}</small></dd></div>
			<div><dt>To</dt><dd>{formatCameraNodeLabel(toNode?.label, connection.toNodeId)}<small class="id">{connection.toNodeId}</small></dd></div>
			<div><dt>Anchors</dt><dd>{connection.positionPath.anchors.length}</dd></div>
			<div><dt>Clearance</dt><dd>{connection.clearance.toFixed(2)} m</dd></div>
		</dl>

		{#if graph}
			<EditorCameraConnectionTiming
				{connection}
				direction={timingDirection}
				graph={graph}
				disabled={store.isAuthoringPauseBlocked}
				oncommit={commitDuration}
				onDirectionChange={selectDirection}
				onUseAutomatic={useAutomatic}
			/>
		{/if}

		<button
			type="button"
			class="danger"
			disabled={store.isAuthoringPauseBlocked}
			onclick={() => store.deleteConnection(connection.id)}
		>Delete camera connection</button>
	</section>
{:else if selection?.kind === 'anchor' && anchor && anchorWorld && connection}
	<section class="camera-plan-panel" aria-label="Camera Plan anchor editor">
		<div class="section-heading">
			<h2>Curve anchor</h2>
			<span>{anchor.roomId ? `${anchor.roomId} local` : 'World-space'}</span>
		</div>
		<dl>
			<div><dt>Anchor</dt><dd class="id">{anchor.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
		</dl>
		{#key `${connection.id}:${anchor.id}`}
			<div class="xz-fields" aria-label="Camera path anchor world position">
				<EditorNumberField
					label="World X (m)"
					value={anchorWorld[0]}
					step={0.01}
					fractionDigits={3}
					oncommit={(x) => commitAnchorXZ(x, anchorWorld[1])}
				/>
				<EditorNumberField
					label="World Z (m)"
					value={anchorWorld[1]}
					step={0.01}
					fractionDigits={3}
					oncommit={(z) => commitAnchorXZ(anchorWorld[0], z)}
				/>
			</div>
		{/key}
		<button
			type="button"
			class="danger"
			disabled={store.isAuthoringPauseBlocked}
			onclick={() => store.deleteSelectedAnchor()}
		>Delete Anchor</button>
	</section>
{:else if selection?.kind === 'view-keyframe' && viewKeyframe && connection}
	<section class="camera-plan-panel" aria-label="Camera Plan view breakpoint">
		<div class="section-heading">
			<h2>View breakpoint</h2>
			<span>{selection.direction}</span>
		</div>
		<p class="passive-note">
			A view breakpoint stays selected across the Plan ⇄ 3D switch, but its
			framing is authored in Camera 3D. Switch to 3D to edit the look target,
			FOV, and aim.
		</p>
		<dl>
			<div><dt>View key</dt><dd class="id">{viewKeyframe.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
		</dl>
	</section>
{/if}

{#if selection && store.statusMessage}
	<p class="status" role="status">{store.statusMessage}</p>
{/if}

<style>
	.camera-plan-panel { display: flex; flex-direction: column; gap: 0.75rem; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h2 { margin: 0; font-size: 0.9rem; }
	.section-heading span { color: var(--editor-text-muted); font-size: 0.68rem; }
	.status { margin: 0.75rem 0 0; color: var(--editor-warning); font-size: 0.7rem; line-height: 1.4; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.4rem 1fr; gap: 0.45rem; }
	dt, .label-field span { color: var(--editor-text-muted); font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	dd { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; font-size: 0.76rem; }
	dd small { color: var(--editor-text-muted); font-size: 0.62rem; }
	.id { font-family: var(--editor-font); overflow-wrap: anywhere; }
	.label-field { display: flex; flex-direction: column; gap: 0.3rem; }
	.label-field input { width: 100%; box-sizing: border-box; padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel); color: var(--editor-text-primary); }
	.order-badge { align-self: flex-start; padding: 0.14rem 0.5rem; border: 1px solid var(--editor-accent-border); border-radius: 999px; background: var(--editor-bg-selected); color: var(--editor-text-primary); font-size: 0.68rem; font-weight: 650; }
	.unsequenced-badge { align-self: flex-start; padding: 0.14rem 0.5rem; border: 1px dashed var(--editor-border-strong); border-radius: 999px; color: var(--editor-outline-muted); font-size: 0.66rem; }
	.xz-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; }
	.topology { display: grid; grid-template-columns: 1fr; gap: 0.35rem; }
	button { padding: 0.42rem 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.danger { border-color: var(--editor-danger-border); color: var(--editor-danger-fg); }
	button:disabled, input:disabled { opacity: 0.42; cursor: default; }
	.connections { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.4rem; border-top: 1px solid var(--editor-border-subtle); }
	.connections h3 { margin: 0; font-size: 0.78rem; letter-spacing: 0.02em; color: var(--editor-text-secondary); }
	.connections-empty { margin: 0; color: var(--editor-text-muted); font-size: 0.7rem; }
	.connection-list { display: flex; flex-direction: column; gap: 0.28rem; margin: 0; padding: 0; list-style: none; }
	.connection-row { display: grid; grid-template-columns: 1rem minmax(0, 1fr) auto auto; gap: 0.5rem; align-items: center; padding: 0.3rem 0.4rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.28rem; background: var(--editor-bg-panel); }
	.connection-row.outgoing { border-left: 2px solid var(--editor-accent); }
	.connection-row.incoming { border-left: 2px solid var(--editor-accent-hover); }
	.badge { color: var(--editor-accent); font: 0.7rem/1 var(--editor-font); text-align: center; }
	.connection-row.incoming .badge { color: var(--editor-accent-hover); }
	.partner { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.72rem; color: var(--editor-text-primary); }
	.room { color: var(--editor-text-muted); font: 0.6rem/1 var(--editor-font); }
	.meta { color: var(--editor-text-muted); font-size: 0.6rem; }
	.passive-note { margin: 0; padding: 0.55rem; border: 1px solid var(--editor-accent-border); border-radius: 0.35rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font-size: 0.7rem; line-height: 1.45; }
</style>
