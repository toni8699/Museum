<script lang="ts">
	import { Link, Unlink } from 'lucide-svelte';
	import EditorCameraPreviewControls from './EditorCameraPreviewControls.svelte';
	import EditorCameraTimelineDots from './EditorCameraTimelineDots.svelte';
	import EditorCameraTimelineRuler from './EditorCameraTimelineRuler.svelte';
	import EditorCameraEdgeRuler from './EditorCameraEdgeRuler.svelte';
	import { useCameraTimeline } from './hooks/use-camera-timeline.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store, viewMode = '3d' }: { store: MuseumEditorStore; viewMode?: 'plan' | '3d' } = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const preview = $derived(timelineApi.preview);
	const previewScope = $derived(timelineApi.previewScope);
	const edgeTimeline = $derived(timelineApi.edgeTimeline);
	const activeConnectionId = $derived(store.activeCameraConnectionId);

	// S10.1.4 — derived loop readout. The loop is never a mutation: it exists
	// iff a distinct tail→head connection record exists (two-node pairs never
	// loop — their only record is also the chain transition, T5/T8).
	const chain = $derived(store.guidedTourNodeIds);
	const flowLoopConnectionId = $derived(store.flowLoopConnectionId);
	const flowHasLoop = $derived(flowLoopConnectionId !== null);
	// The loop row never renders for N < 3 (a two-node pair never loops and
	// the S10.2 contract pins the readout to N ≥ 3).
	const showLoopRow = $derived(chain.length >= 3);
	const chainHeadNodeId = $derived(chain[0]);
	const chainTailNodeId = $derived(chain.at(-1));
	const loopDurationSeconds = $derived.by(() => {
		if (!flowLoopConnectionId) return null;
		const connection = store.document.connections.find(
			(candidate) => candidate.id === flowLoopConnectionId
		);
		const timing = connection?.timing?.forward;
		return typeof timing?.durationSeconds === 'number' ? timing.durationSeconds : null;
	});

	function nodeLabel(nodeId: string) {
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		return node?.label ?? nodeId;
	}

	function disconnectLoop() {
		if (!flowLoopConnectionId) return;
		store.deleteConnection(flowLoopConnectionId);
	}

	function connectTailToHead() {
		if (!chainTailNodeId) return;
		store.selectionActions.selectNavigationNode(chainTailNodeId);
		store.beginConnectExistingNodes();
	}
</script>

{#if previewScope === 'edge'}
	<!-- S3 — active Preview Edge: edge-local ruler + preview controls, no guided Dots (minimal) -->
	<div class="timeline-panel">
		<EditorCameraEdgeRuler {store} />
		<EditorCameraPreviewControls {store} />
	</div>
{:else if previewScope === 'camera'}
	<!-- S3 — Preview Camera: static pose, no ruler -->
	<div class="timeline-panel">
		<EditorCameraPreviewControls {store} />
	</div>
{:else if previewScope === 'sequence'}
	{#if timeline}
		<div class="timeline-panel">
			{#if chain.length > 0}
				<div class="loop-readout" aria-label="Derived loop state">
					{#if showLoopRow && flowHasLoop}
						<span class="loop-readout__text">
							<strong>Loops via:</strong> {nodeLabel(chainTailNodeId!)} → {nodeLabel(chainHeadNodeId!)}
							{#if loopDurationSeconds !== null}
								<span class="loop-duration">({loopDurationSeconds.toFixed(1)}s)</span>
							{/if}
						</span>
						<button
							type="button"
							class="loop-action"
							title="Delete the closing connection — playback reverts to stopping at the tail"
							onclick={disconnectLoop}
						><Unlink size={13} aria-hidden="true" /> Disconnect Loop</button>
					{:else if showLoopRow}
						<span class="loop-readout__text">
							<strong>Stops at</strong> {nodeLabel(chainTailNodeId!)}
						</span>
						<button
							type="button"
							class="loop-action"
							title="Connect the last node back to the first — the path then loops"
							onclick={connectTailToHead}
						><Link size={13} aria-hidden="true" /> Connect to {nodeLabel(chainHeadNodeId!)}</button>
					{/if}
				</div>
			{/if}
			<EditorCameraTimelineRuler {store} />
			<EditorCameraPreviewControls {store} />
			<EditorCameraTimelineDots {store} {viewMode} />
		</div>
	{:else}
		<div class="timeline-error" role="status">
			<strong>Camera preview active</strong>
			<span>Stop preview to return to camera editing.</span>
			<EditorCameraPreviewControls {store} />
		</div>
	{/if}
{:else if !preview && activeConnectionId && edgeTimeline}
	<!-- S3 — idle-with-connection candidate: read-only edge ruler + CTA (takes precedence over guided timeline) -->
	<div class="timeline-panel">
		<EditorCameraEdgeRuler {store} />
	</div>
{:else if timeline}
	<div class="timeline-panel">
		{#if chain.length > 0}
			<div class="loop-readout" aria-label="Derived loop state">
				{#if showLoopRow && flowHasLoop}
					<span class="loop-readout__text">
						<strong>Loops via:</strong> {nodeLabel(chainTailNodeId!)} → {nodeLabel(chainHeadNodeId!)}
						{#if loopDurationSeconds !== null}
							<span class="loop-duration">({loopDurationSeconds.toFixed(1)}s)</span>
						{/if}
					</span>
					<button
						type="button"
						class="loop-action"
						title="Delete the closing connection — playback reverts to stopping at the tail"
						onclick={disconnectLoop}
					><Unlink size={13} aria-hidden="true" /> Disconnect Loop</button>
				{:else if showLoopRow}
					<span class="loop-readout__text">
						<strong>Stops at</strong> {nodeLabel(chainTailNodeId!)}
					</span>
					<button
						type="button"
						class="loop-action"
						title="Connect the last node back to the first — the path then loops"
						onclick={connectTailToHead}
					><Link size={13} aria-hidden="true" /> Connect to {nodeLabel(chainHeadNodeId!)}</button>
				{/if}
			</div>
		{/if}
		<EditorCameraTimelineRuler {store} />
		{#if preview}
			<EditorCameraPreviewControls {store} />
		{/if}
		<EditorCameraTimelineDots {store} {viewMode} />
	</div>
{:else}
	<div class="timeline-error" role="status">
		{#if preview}
			<strong>Camera preview active</strong>
			<span>Stop preview to return to camera editing.</span>
			<EditorCameraPreviewControls {store} />
		{:else}
			<strong>{chain.length > 0 ? 'Camera timeline unavailable' : 'No camera flow yet'}</strong>
			<span>
				{chain.length > 0
					? 'The flow has a missing transition — connect the two stops to continue.'
					: 'Place and connect camera nodes to build the path.'}
			</span>
		{/if}
	</div>
{/if}

<style>
	.timeline-panel { display: flex; min-height: 0; flex-direction: column; gap: 0.55rem; }
	.timeline-panel :global(.transport button),
	.timeline-panel :global(.preview-transport button) {
		padding: 0.34rem 0.48rem; border: 1px solid #3a3a46; border-radius: 0.3rem;
		background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.timeline-error { display: flex; height: 100%; min-height: 7rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; color: #a8a29a; text-align: center; }
	.timeline-error strong { color: #d5cec2; font-size: 0.78rem; }
	.timeline-error span { font-size: 0.68rem; }
	.timeline-error :global(.preview-transport) { width: min(100%, 54rem); justify-content: center; margin-top: 0.55rem; }

	/* S10.1.4 — derived loop readout strip (matches the Sequence Inspector's
	   loop row; the timeline reads the same distinct-connection test). */
	.loop-readout {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.42rem 0.55rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
	}
	.loop-readout__text {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.3rem;
		color: #c9c3b8;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.loop-readout__text strong { color: #fff2c7; font-weight: 650; }
	.loop-duration { color: #918c84; font-variant-numeric: tabular-nums; }
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
	.loop-action:hover:not(:disabled) { border-color: #d6b35f; color: #fff2c7; }
	.loop-action:disabled { opacity: 0.4; cursor: default; }
</style>
