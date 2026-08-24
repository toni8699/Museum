<script lang="ts">
	import { Link, Unlink } from 'lucide-svelte';
	import EditorCameraPreviewControls from './EditorCameraPreviewControls.svelte';
	import EditorCameraTimelineDots from './EditorCameraTimelineDots.svelte';
	import EditorCameraTimelineRuler from './EditorCameraTimelineRuler.svelte';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';
	import type { EditorStore } from '../editor-store.svelte';

	let {
		store,
		viewMode = '3d',
		contextMenu = null
	}: {
		store: EditorStore;
		viewMode?: 'plan' | '3d';
		contextMenu?: import('../context-menu/context-menu-state.svelte').EditorContextMenuStore | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const preview = $derived(timelineApi.preview);

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
		<div class="timeline-toolbar">
			<EditorCameraTimelineRuler {store} />
			{#if preview}<EditorCameraPreviewControls {store} />{/if}
		</div>
		<EditorCameraTimelineDots {store} {viewMode} {contextMenu} />
	</div>
{:else}
	<div class="timeline-error" role="status">
		{#if preview}
			<strong>Camera flow unavailable</strong>
			<span>Connect the camera nodes to populate the five timeline lanes.</span>
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
	.timeline-panel { display: flex; min-height: 0; flex-direction: column; gap: 0.25rem; }
	.timeline-toolbar { display: flex; min-width: 0; min-height: 28px; align-items: center; gap: 0.65rem; }
	.timeline-toolbar > :global(.transport) { min-width: 24rem; flex: 1; }
	.timeline-toolbar > :global(.preview-transport) { width: auto; max-width: none; flex: 0 1 auto; margin: 0; }
	.timeline-toolbar :global(.preview-transport p) { display: none; }
	.timeline-panel :global(.transport button),
	.timeline-panel :global(.preview-transport button) {
		padding: 0.34rem 0.48rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.timeline-error { display: flex; height: 100%; min-height: 7rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; color: var(--editor-text-secondary); text-align: center; }
	.timeline-error strong { color: var(--editor-text-primary); font-size: 0.78rem; }
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
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.32rem;
		background: var(--editor-bg-panel-raised);
	}
	.loop-readout__text {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 0.3rem;
		color: var(--editor-text-secondary);
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.loop-readout__text strong { color: var(--editor-text-primary); font-weight: 650; }
	.loop-duration { color: var(--editor-text-muted); font-variant-numeric: tabular-nums; }
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
	.loop-action:hover:not(:disabled) { border-color: var(--editor-accent); color: var(--editor-text-primary); }
	.loop-action:disabled { opacity: 0.4; cursor: default; }
</style>
