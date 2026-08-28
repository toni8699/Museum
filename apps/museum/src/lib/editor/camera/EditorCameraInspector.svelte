<script lang="ts">
	import type { Vec3 } from '$lib/types/scene';
	import type { CameraConnectionDirection } from '$lib/types/scene';
	import { isFlowNode } from '$lib/content/scene';
	import EditorVec3Field from '../fields/EditorVec3Field.svelte';
	import EditorCameraFovField from './EditorCameraFovField.svelte';
	import EditorProgressField from '../fields/EditorProgressField.svelte';
	import EditorNumberField from '../fields/EditorNumberField.svelte';
	import EditorCameraConnectionTiming from './EditorCameraConnectionTiming.svelte';
	import EditorCameraEdgePreviewActions from './EditorCameraEdgePreviewActions.svelte';
	import EditorCameraFramingControls from './EditorCameraFramingControls.svelte';
	import type { EditorCameraHandle } from '../editor-selection';
	import type { EditorStore } from '../editor-store.svelte';
	import { getNodeConnections } from './editor-camera-connections';
	import { formatCameraNodeLabel } from '../editor-outliner';
	import {
		CAMERA_FOCUS_TIMING_PRESETS,
		clampEnvelopeHandle,
		type FocusTimingPresetName,
		type EnvelopeHandleName
	} from './editor-camera-framing-authoring';

	let { store }: { store: EditorStore } = $props();

	const selection = $derived(store.navigationSelection);
	const node = $derived(store.selectedNavigationNode);
	const pendingNode = $derived(node ? store.isPendingNavigationNode(node.id) : false);
	const point = $derived(store.selectedCameraPoint);
	const connection = $derived(store.selectedConnection);
	const anchor = $derived(store.selectedAnchor);
	const viewKeyframe = $derived(store.selectedViewKeyframe);
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
		node && !pendingNode ? getNodeConnections(store.document, node.id) : null
	);
	const nodeOnSequence = $derived(node ? !store.isRelic && isFlowNode(node) : false);
	const partnerLabels = $derived(
		new Map(
			store.document.navigationNodes.map((candidate) => [
				candidate.id,
				formatCameraNodeLabel(candidate.label, candidate.id)
			])
		)
	);

	let labelDraft = $state('');
	$effect(() => {
		labelDraft = node?.label ?? '';
	});

	// S10.1 closeout — view-breakpoint Aim: incremental yaw (world Y) + pitch
	// (local X) deltas in degrees, applied as one orbit gesture per commit.
	let aimYawDeg = $state(0);
	let aimPitchDeg = $state(0);

	function applyAim() {
		if (!Number.isFinite(aimYawDeg) || !Number.isFinite(aimPitchDeg)) return;
		store.commitSelectedViewKeyframeAim(
			(aimYawDeg * Math.PI) / 180,
			(aimPitchDeg * Math.PI) / 180
		);
	}

	function selectHandle(handle: EditorCameraHandle) {
		store.selectionActions.selectCameraHandle(handle);
	}

	function commitNodePoint(next: Vec3) {
		if (selection?.kind !== 'node') return false;
		return store.commitNavigationNodePoint(selection.nodeId, selection.handle, next);
	}

	function commitAnchorPoint(next: Vec3) {
		return store.commitSelectedAnchorPoint(next);
	}

	function commitViewTarget(next: Vec3) {
		return store.commitSelectedViewKeyframeTarget(next);
	}

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

	function finishAnchorEditing() {
		store.finishAnchorEditing();
	}

	function finishViewKeyframeEditing() {
		store.finishViewKeyframeEditing();
	}

	// ===================================================================
	// P1.6 — Camera 3D framing authoring
	// ===================================================================

	/** Active direction for framing controls — from selection or preview. */
	const framingDirection = $derived<CameraConnectionDirection>(
		selection?.kind === 'view-keyframe'
			? selection.direction
			: selection?.kind === 'connection'
				? store.activeCameraDirection
				: 'forward'
	);

	/** Session-only envelope policy for the active connection+direction. */
	const envelopePolicy = $derived(
		connection
			? store.getEnvelopePolicy(connection.id, framingDirection)
			: null
	);

	/** Resolve a navigation graph for timing computation. */
	const cameraGraph = $derived.by(() => {
		try {
			return store.resolveCameraGraph();
		} catch {
			return null;
		}
	});

	function applyPreset(presetName: FocusTimingPresetName) {
		if (!connection) return;
		const preset = CAMERA_FOCUS_TIMING_PRESETS[presetName];
		store.applyFocusTimingPreset(connection.id, framingDirection, preset);
	}

	function commitHandle(handle: EnvelopeHandleName, value: number) {
		if (!connection || !envelopePolicy) return false;
		const next = clampEnvelopeHandle(envelopePolicy.envelope, handle, value);
		if (!next) return false;
		return store.commitEnvelopeHandle(connection.id, framingDirection, next);
	}

	function commitTimingDuration(value: number) {
		if (!connection || selection?.kind !== 'connection') return;
		const timing = connection.timing?.[framingDirection];
		store.setConnectionTiming(connection.id, framingDirection, {
			durationSeconds: value,
			...(timing?.easing !== undefined ? { easing: timing.easing } : {})
		});
	}

	function commitTimingAutomatic() {
		if (!connection || selection?.kind !== 'connection') return;
		const timing = connection.timing?.[framingDirection];
		if (!timing) return;
		if (timing.easing !== undefined) {
			store.setConnectionTiming(connection.id, framingDirection, {
				easing: timing.easing
			});
		} else {
			store.setConnectionTiming(connection.id, framingDirection, null);
		}
	}
</script>

{#if selection?.kind === 'node' && node && point}
	<section class="camera-node" aria-label="Camera node editor">
		<div class="section-heading">
			<h2>{pendingNode ? 'Pending camera' : 'Camera node'}</h2>
			<span>{pendingNode ? 'Not saved' : 'Room-local'}</span>
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
		</dl>

		<div class="handles" aria-label="Camera helper handle">
			{#each ['position', 'target'] as handle}
				<button
					type="button"
					class:active={selection.handle === handle}
					aria-pressed={selection.handle === handle}
					disabled={handle === 'target'
						? store.isInspectorFramingBlocked
						: store.isAuthoringPauseBlocked}
					onclick={() => selectHandle(handle as EditorCameraHandle)}
				>
					{handle === 'position' ? 'Position' : 'Target'}
				</button>
			{/each}
		</div>

		{#key `${selection.nodeId}:${selection.handle}`}
			<EditorVec3Field
				legend={`${selection.handle === 'position' ? 'Position' : 'Target'} (m)`}
				value={point}
				step={0.01}
				disabled={selection.handle === 'target'
					? store.isInspectorFramingBlocked
					: store.isAuthoringPauseBlocked}
				oncommit={commitNodePoint}
			/>
		{/key}

		<EditorCameraFovField
			value={node.fov}
			showLensPresets={true}
			disabled={store.isInspectorFramingBlocked}
			oncommit={(fov) => store.commitSelectedNodeFov(fov)}
		/>

		{#if pendingNode}
			<div class="topology" aria-label="Pending camera actions">
				<p>Choose any existing camera node in viewport or the Sequence Inspector to create first connection.</p>
				<button
					type="button"
					class="danger"
					disabled={store.isEditorInteractionActive}
					onclick={() => store.cancelPendingNavigation('Camera placement cancelled')}
				>Cancel camera</button>
			</div>
		{:else}
			<div class="topology" aria-label="Camera topology commands">
				<button
					type="button"
					disabled={nodeOnSequence || store.isDocumentTransactionActive || store.isEditorInteractionActive || store.pendingNavigationCommand !== null}
					title={nodeOnSequence ? 'Inspect at Sequence boundary' : 'Preview Camera'}
					onclick={() => store.previewCamera(node.id, 'visitor')}
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
		{/if}

		{#if !pendingNode && nodeConnections}
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
							<li class="connection-row outgoing" title="{row.anchorsCount} anchors · {row.kind} · {row.clearance.toFixed(2)} m clearance · {row.keyCounts.forward}+{row.keyCounts.reverse} view keys ({row.keyCounts.total} total)">
								<div class="connection-line">
									<span class="badge" aria-hidden="true">▶</span>
									<span class="partner" title={partnerLabels.get(row.partnerId) ?? row.partnerId}>
										{partnerLabels.get(row.partnerId) ?? row.partnerId}
									</span>
									{#if row.partnerRoomId !== node.roomId}
										<span class="room">{row.partnerRoomId}</span>
									{/if}
									<span class="keys">{row.keyCounts.total}</span>
								</div>
							</li>
						{/each}
						{#each nodeConnections.incoming as row (row.connectionId)}
							<li class="connection-row incoming" title="{row.anchorsCount} anchors · {row.kind} · {row.clearance.toFixed(2)} m clearance · {row.keyCounts.forward}+{row.keyCounts.reverse} view keys ({row.keyCounts.total} total)">
								<div class="connection-line">
									<span class="badge" aria-hidden="true">◀</span>
									<span class="partner" title={partnerLabels.get(row.partnerId) ?? row.partnerId}>
										{partnerLabels.get(row.partnerId) ?? row.partnerId}
									</span>
									{#if row.partnerRoomId !== node.roomId}
										<span class="room">{row.partnerRoomId}</span>
									{/if}
									<span class="keys">{row.keyCounts.total}</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</section>
{:else if selection?.kind === 'connection' && connection}
	<section class="camera-node" aria-label="Camera connection editor">
		<div class="section-heading">
			<h2>Camera connection</h2>
			<span>{connection.positionPath.kind}</span>
		</div>
		<dl>
			<div><dt>Connection</dt><dd class="id">{connection.id}</dd></div>
			<div><dt>From</dt><dd>{fromNode?.label ?? connection.fromNodeId}<small class="id">{connection.fromNodeId}</small></dd></div>
			<div><dt>To</dt><dd>{toNode?.label ?? connection.toNodeId}<small class="id">{connection.toNodeId}</small></dd></div>
			<div><dt>Anchors</dt><dd>{connection.positionPath.anchors.length}</dd></div>
			<div><dt>Clearance</dt><dd>{connection.clearance.toFixed(2)} m</dd></div>
			<div><dt>Forward views</dt><dd>{connection.viewTracks?.forward.length ?? 0}</dd></div>
			<div><dt>Reverse views</dt><dd>{connection.viewTracks?.reverse.length ?? 0}</dd></div>
		</dl>
		<!-- P1.6 — Connection-Inspector timing (shared with Camera Plan) -->
		{#if cameraGraph}
			<EditorCameraConnectionTiming
				{connection}
				direction={framingDirection}
				graph={cameraGraph}
				disabled={store.isAuthoringPauseBlocked}
				oncommit={commitTimingDuration}
				onDirectionChange={(d) => store.selectionActions.selectCameraConnectionDirection(connection.id, d)}
				onUseAutomatic={commitTimingAutomatic}
			/>
		{/if}

		<EditorCameraEdgePreviewActions {store} {connection} />

		<!-- P1.6 — Framing controls (presets, envelope, diagnostics, Advanced) -->
		<EditorCameraFramingControls
			{connection}
			direction={framingDirection}
			policyState={envelopePolicy}
			graph={cameraGraph}
			disabled={store.isInspectorFramingBlocked}
			onPresetClick={applyPreset}
			onHandleCommit={commitHandle}
		/>

		<button
			type="button"
			disabled={connection.positionPath.kind === 'auto-bezier' || store.isAuthoringPauseBlocked}
			onclick={() => store.convertSelectedConnectionToSmooth()}
		>Convert to Smooth Curve</button>
		<button
			type="button"
			class="danger"
			disabled={store.isAuthoringPauseBlocked}
			onclick={() => store.deleteConnection(connection.id)}
		>Delete camera connection</button>
	</section>
{:else if selection?.kind === 'view-keyframe' && connection && viewKeyframe}
	<section class="camera-node" aria-label="Camera view breakpoint editor">
		<div class="section-heading">
			<h2>View breakpoint</h2>
			<span>{selection.direction}</span>
		</div>
		<dl>
			<div><dt>View key</dt><dd class="id">{viewKeyframe.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
			<div><dt>Direction</dt><dd>{selection.direction}</dd></div>
			<div><dt>Target space</dt><dd>{viewKeyframe.roomId ? `${viewKeyframe.roomId} local` : 'World-space'}</dd></div>
		</dl>
		<EditorProgressField
			value={viewKeyframe.progress}
			disabled={store.isAuthoringPauseBlocked}
			oncommit={(progress) => store.commitSelectedViewKeyframeProgress(progress)}
		/>
		{#key `${connection.id}:${selection.direction}:${viewKeyframe.id}:target`}
			<EditorVec3Field
				legend="Look target (m)"
				value={viewKeyframe.cameraTarget}
				step={0.01}
				disabled={store.isInspectorFramingBlocked}
				oncommit={commitViewTarget}
			/>
		{/key}
		<EditorCameraFovField
			value={viewKeyframe.fov}
			showLensPresets={true}
			disabled={store.isInspectorFramingBlocked}
			oncommit={(fov) => store.commitSelectedViewKeyframeFov(fov)}
		/>

		<!-- P1.6 — Framing controls for this key's direction -->
		<EditorCameraFramingControls
			{connection}
			direction={selection.direction}
			policyState={envelopePolicy}
			graph={cameraGraph}
			disabled={store.isInspectorFramingBlocked}
			onPresetClick={applyPreset}
			onHandleCommit={commitHandle}
		/>

		<div class="aim" aria-label="Aim look target">
			<div class="section-heading">
				<h3>Aim look target</h3>
			</div>
			<div class="aim-fields">
				<EditorNumberField
					label="Yaw Δ (°)"
					value={aimYawDeg}
					step={5}
					fractionDigits={1}
					oncommit={(value) => {
						aimYawDeg = value;
					}}
				/>
				<EditorNumberField
					label="Pitch Δ (°)"
					value={aimPitchDeg}
					step={5}
					fractionDigits={1}
					oncommit={(value) => {
						aimPitchDeg = value;
					}}
				/>
			</div>
			<button
				type="button"
				disabled={store.isInspectorFramingBlocked}
				onclick={applyAim}
			>Apply Aim</button>
		</div>
		<button
			type="button"
			class="danger"
			disabled={store.isAuthoringPauseBlocked}
			onclick={() => store.deleteSelectedViewKeyframe()}
		>Delete view breakpoint</button>
		<button
			type="button"
			class="done"
			disabled={store.isAuthoringPauseBlocked}
			onclick={finishViewKeyframeEditing}
		>Done editing view</button>
	</section>
{:else if selection?.kind === 'anchor' && connection && anchor}
	<section class="camera-node" aria-label="Camera path anchor editor">
		<div class="section-heading">
			<h2>Curve anchor</h2>
			<span>{anchor.roomId ? `${anchor.roomId} local` : 'World-space'}</span>
		</div>
		<dl>
			<div><dt>Anchor</dt><dd class="id">{anchor.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
		</dl>
		{#key `${connection.id}:${anchor.id}`}
			<EditorVec3Field
				legend="Anchor position (m)"
				value={anchor.position}
				step={0.01}
				disabled={store.isAuthoringPauseBlocked}
				oncommit={commitAnchorPoint}
			/>
		{/key}
		<button
			type="button"
			class="danger"
			disabled={store.isAuthoringPauseBlocked}
			onclick={() => store.deleteSelectedAnchor()}
		>Delete Anchor</button>
		<button
			type="button"
			class="done"
			disabled={store.isAuthoringPauseBlocked}
			onclick={finishAnchorEditing}
		>Done editing anchor</button>
	</section>
{/if}

{#if selection && store.statusMessage}
	<p class="status" role="status">{store.statusMessage}</p>
{/if}

<style>
	.camera-node { display: flex; flex-direction: column; gap: 0.75rem; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h2 { margin: 0; font-size: 0.9rem; }
	.section-heading span { color: var(--editor-text-muted); font-size: 0.68rem; }
	.status { margin: 0.75rem 0 0; color: var(--editor-warning); font-size: 0.7rem; line-height: 1.4; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.4rem 1fr; gap: 0.45rem; }
	dt, .label-field span { color: var(--editor-text-muted); font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	dd { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; font-size: 0.76rem; }
	.id { font-family: var(--editor-font); overflow-wrap: anywhere; }
	.label-field { display: flex; flex-direction: column; gap: 0.3rem; }
	.label-field input { width: 100%; box-sizing: border-box; padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel); color: var(--editor-text-primary); }
	.handles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	.topology { display: grid; grid-template-columns: 1fr; gap: 0.35rem; }
	button { padding: 0.42rem 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.active, button.done { border-color: var(--editor-accent); background: var(--editor-bg-selected); box-shadow: 0 0 8px rgb(59 130 246 / 30%); color: var(--editor-accent-hover); }
	button.danger { border-color: var(--editor-danger-border); color: var(--editor-danger-fg); }
	button:disabled, input:disabled { opacity: 0.42; cursor: default; }
	.aim { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.4rem; border-top: 1px solid var(--editor-border-subtle); }
	.aim .section-heading h3 { margin: 0; font-size: 0.78rem; letter-spacing: 0.02em; color: var(--editor-text-secondary); }
	.aim-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; }
	.connections { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.4rem; border-top: 1px solid var(--editor-border-subtle); }
	.connections h3 { margin: 0; font-size: 0.78rem; letter-spacing: 0.02em; color: var(--editor-text-secondary); }
	.connections-empty { margin: 0; color: var(--editor-text-muted); font-size: 0.7rem; }
	.connection-list { display: flex; flex-direction: column; gap: 0.28rem; margin: 0; padding: 0; list-style: none; }
	.connection-row { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.3rem 0.4rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.28rem; background: var(--editor-bg-panel); }
	.connection-row.outgoing { border-left: 2px solid var(--editor-accent); }
	.connection-row.incoming { border-left: 2px solid var(--editor-accent-hover); }
	.connection-line { display: grid; grid-template-columns: 1rem minmax(0, 1fr) auto auto; gap: 0.5rem; align-items: center; }
	.badge { color: var(--editor-accent); font: 0.7rem/1 var(--editor-font); text-align: center; }
	.connection-row.incoming .badge { color: var(--editor-accent-hover); }
	.partner { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.72rem; color: var(--editor-text-primary); }
	.room { color: var(--editor-text-muted); font: 0.6rem/1 var(--editor-font); }
	.keys { color: var(--editor-text-muted); font: 0.6rem/1 var(--editor-font); }
</style>
