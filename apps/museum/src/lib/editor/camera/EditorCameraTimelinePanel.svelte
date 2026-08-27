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
	// P11.3 §9 — scope-first branching: presentation resolves from canonical
	// selection + preview scope before timeline existence.
	const scope = $derived(timelineApi.scope);
	const result = $derived(timelineApi.timelineResult);
	const edgeTimeline = $derived(timelineApi.edgeTimeline);
	const targetKindLabel = $derived(
		store.navigationSelection?.kind === 'connection' ? 'Edge' : 'Camera'
	);

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

{#if scope === 'camera'}
	<!-- P11.3 §4 — Camera is static: no ruler, lanes, or fabricated time; the
	     panel height stays stable (no jump to/from the old error panel). -->
	<div class="timeline-panel">
		<div class="timeline-toolbar">
			{#if preview}<EditorCameraPreviewControls {store} />{/if}
		</div>
		{#if result.diagnostic.kind === 'invalid-target'}
			<p class="inline-diagnostic">{targetKindLabel} unavailable</p>
		{/if}
	</div>
{:else if scope === 'edge'}
	<!-- P12.3 — Edge scope keeps one shell and adds inert truthful Edge-local
	     lanes. Relic keeps its frozen P11.4 mini-shell. -->
	<div class="timeline-panel">
		<div class="timeline-toolbar">
			<EditorCameraTimelineRuler {store} />
			{#if preview}<EditorCameraPreviewControls {store} />{/if}
		</div>
		{#if edgeTimeline && !store.isRelic}
			<EditorCameraTimelineDots {store} {viewMode} {contextMenu} edgeTimeline={edgeTimeline} />
		{/if}
		{#if result.diagnostic.kind === 'invalid-target'}
			<p class="inline-diagnostic">{targetKindLabel} unavailable</p>
		{/if}
	</div>
{:else}
	<!-- P11.3 §4 — Sequence scope / idle keeps the ruler + Dots; the derived
	     loop readout renders only in Sequence scope. Compact inline
	     diagnostics replace the old modal-like error panel. -->
	<div class="timeline-panel">
		{#if scope === 'sequence' && chain.length > 0}
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
		{#if timeline}<EditorCameraTimelineDots {store} {viewMode} {contextMenu} />{/if}
		{#if result.diagnostic.kind === 'gap'}
			<p class="inline-diagnostic">Gap at {nodeLabel(result.diagnostic.fromNodeId)}</p>
		{:else if result.diagnostic.kind === 'no-flow'}
			<p class="inline-diagnostic">No sequence yet</p>
		{:else if result.diagnostic.kind === 'invalid-target'}
			<p class="inline-diagnostic">{targetKindLabel} unavailable</p>
		{/if}
	</div>
{/if}

<style>
	.timeline-panel { display: flex; min-height: 0; flex-direction: column; gap: 0.25rem; }
	.timeline-toolbar { display: flex; min-width: 0; min-height: 28px; align-items: center; gap: 0.65rem; }
	.timeline-toolbar > :global(.transport) { min-width: 24rem; flex: 1; }
	.timeline-toolbar > :global(.preview-transport) { width: auto; max-width: none; flex: 0 1 auto; margin: 0; }
	.timeline-panel :global(.transport button),
	.timeline-panel :global(.preview-transport button) {
		padding: 0.34rem 0.48rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	/* P11.3 §9 — compact inline diagnostic (replaces the old modal-like error
	   panel); the timeline shell stays stable and the valid selected Edge
	   keeps working even when Sequence cannot build. */
	.inline-diagnostic {
		margin: 0;
		padding: 0.3rem 0.55rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.28rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font-size: 0.68rem;
	}

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
