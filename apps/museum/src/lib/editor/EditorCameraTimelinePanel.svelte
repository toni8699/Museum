<script lang="ts">
	import { onMount } from 'svelte';
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import {
		cameraTimelineEdgeProgressAtProgress,
		cameraTimelineProgressAtEdgeProgress,
		type EditorCameraTimeline,
		type EditorCameraTimelineEdge
	} from './editor-camera-timeline';
	import EditorCameraPreviewControls from './EditorCameraPreviewControls.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	type TimelineViewKeyMarker = {
		connectionId: string;
		direction: CameraConnectionDirection;
		keyframeId: string;
		progress: number;
	};

	const timeline = $derived(store.getCameraTimeline());
	const preview = $derived(store.cameraPreview);
	const disabled = $derived(
		store.isEditorInteractionActive ||
		store.isDocumentTransactionActive ||
		Boolean(
			store.cameraPreview &&
				(store.cameraPreview.mode !== 'director' ||
					store.cameraPreview.transport !== 'paused')
		)
	);
	const previewPlaying = $derived(preview?.transport === 'playing');
	const tourTransportDisabled = $derived(
		store.isEditorInteractionActive ||
		store.isDocumentTransactionActive
	);
	const selected = $derived(store.navigationSelection);
	let framingTrackElement = $state<HTMLElement>();
	let keyDrag = $state<{
		pointerId: number;
		target: HTMLElement;
		marker: TimelineViewKeyMarker;
	} | null>(null);
	const activeTrackLabel = $derived(
		store.activeCameraConnectionId
			? `${store.activeCameraDirection === 'forward' ? '▶' : '◀'} ${store.activeCameraConnectionId}`
			: 'Guided directions'
	);

	function edgeDirection(
		edge: EditorCameraTimelineEdge
	): CameraConnectionDirection {
		return store.activeCameraConnectionId === edge.connectionId
			? store.activeCameraDirection
			: edge.direction;
	}

	function readViewKeyMarkers(
		model: EditorCameraTimeline | null
	): TimelineViewKeyMarker[] {
		if (!model) return [];
		const markers: TimelineViewKeyMarker[] = [];
		for (const edge of model.edges) {
			const direction = edgeDirection(edge);
			const connection = store.document.connections.find(
				(candidate) => candidate.id === edge.connectionId
			);
			for (const keyframe of connection?.viewTracks?.[direction] ?? []) {
				const progress = cameraTimelineProgressAtEdgeProgress(
					model,
					edge.connectionId,
					direction,
					keyframe.progress
				);
				if (progress === null) continue;
				markers.push({
					connectionId: edge.connectionId,
					direction,
					keyframeId: keyframe.id,
					progress
				});
			}
		}
		return markers;
	}

	const viewKeyMarkers = $derived(readViewKeyMarkers(timeline));

	function formatTime(seconds: number) {
		const safe = Math.max(0, seconds);
		const minutes = Math.floor(safe / 60);
		const remainder = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
	}

	function percent(progress: number) {
		return `${Math.min(100, Math.max(0, progress * 100))}%`;
	}

	function scrub(event: Event) {
		store.seekCameraTimeline(Number((event.currentTarget as HTMLInputElement).value));
	}

	function toggleTourPlayback() {
		if (preview?.transport === 'playing') {
			store.pauseCameraPreview();
			return;
		}
		store.previewGuidedTour('director');
	}

	function selectEdge(event: MouseEvent, edge: EditorCameraTimelineEdge) {
		if (!timeline) return;
		event.stopPropagation();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const localProgress = rect.width > 0
			? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
			: 0;
		const start = edge.startSeconds / timeline.durationSeconds;
		const end = edge.endSeconds / timeline.durationSeconds;
		store.selectCameraTimelineEdge(
			edge.connectionId,
			edge.direction,
			start + (end - start) * localProgress
		);
	}

	function isEdgeSelected(edge: EditorCameraTimelineEdge) {
		return (
			store.activeCameraConnectionId === edge.connectionId &&
			store.activeCameraDirection === edge.direction
		);
	}

	function isNodeSelected(nodeId: string) {
		return selected?.kind === 'node' && selected.nodeId === nodeId;
	}

	function isKeySelected(marker: TimelineViewKeyMarker) {
		return (
			selected?.kind === 'view-keyframe' &&
			selected.connectionId === marker.connectionId &&
			selected.direction === marker.direction &&
			selected.keyframeId === marker.keyframeId
		);
	}

	function isKeyDragging(marker: TimelineViewKeyMarker) {
		return Boolean(
			keyDrag &&
			keyDrag.marker.connectionId === marker.connectionId &&
			keyDrag.marker.direction === marker.direction &&
			keyDrag.marker.keyframeId === marker.keyframeId
		);
	}

	function releaseKeyDragCapture(active: NonNullable<typeof keyDrag>) {
		if (active.target.hasPointerCapture(active.pointerId)) {
			active.target.releasePointerCapture(active.pointerId);
		}
	}

	function cancelKeyDrag() {
		const active = keyDrag;
		if (!active) return false;
		keyDrag = null;
		releaseKeyDragCapture(active);
		store.cancelViewKeyframeProgressDrag();
		return true;
	}

	function beginKeyDrag(event: PointerEvent, marker: TimelineViewKeyMarker) {
		if (event.button !== 0 || disabled || keyDrag) return;
		if (!store.beginViewKeyframeProgressDrag(marker)) return;
		const target = event.currentTarget as HTMLElement;
		keyDrag = { pointerId: event.pointerId, target, marker };
		target.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function updateKeyDrag(event: PointerEvent) {
		const active = keyDrag;
		if (
			!active ||
			event.pointerId !== active.pointerId ||
			!timeline ||
			!framingTrackElement
		) {
			return;
		}
		const rect = framingTrackElement.getBoundingClientRect();
		const rulerProgress = rect.width > 0
			? (event.clientX - rect.left) / rect.width
			: store.cameraTimelinePlayhead;
		const edgeProgress = cameraTimelineEdgeProgressAtProgress(
			timeline,
			active.marker.connectionId,
			active.marker.direction,
			rulerProgress
		);
		if (edgeProgress !== null) {
			store.updateViewKeyframeProgressDrag(edgeProgress);
		}
		event.preventDefault();
		event.stopPropagation();
	}

	function commitKeyDrag(event: PointerEvent) {
		const active = keyDrag;
		if (!active || event.pointerId !== active.pointerId || event.button !== 0) return;
		keyDrag = null;
		releaseKeyDragCapture(active);
		store.commitViewKeyframeProgressDrag();
		event.preventDefault();
		event.stopPropagation();
	}

	function cancelKeyDragPointer(event: PointerEvent) {
		if (keyDrag?.pointerId !== event.pointerId) return;
		cancelKeyDrag();
	}

	$effect(() => {
		const active = store.viewKeyframeProgressDrag;
		if (
			keyDrag &&
			(!active ||
				active.connectionId !== keyDrag.marker.connectionId ||
				active.direction !== keyDrag.marker.direction ||
				active.keyframeId !== keyDrag.marker.keyframeId)
		) {
			const stale = keyDrag;
			keyDrag = null;
			releaseKeyDragCapture(stale);
		}
	});

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !cancelKeyDrag()) return;
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		const onBlur = () => cancelKeyDrag();
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('blur', onBlur);
		return () => {
			cancelKeyDrag();
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('blur', onBlur);
		};
	});
</script>

{#if timeline}
	<div class="timeline-panel">
		<div class="transport" aria-label="Guided tour timeline transport">
			<button
				type="button"
				aria-label="Previous camera boundary"
				disabled={disabled || store.cameraTimelinePlayhead <= 0}
				onclick={() => store.stepCameraTimeline(-1)}
			>│◀</button>
			<button
				type="button"
				class:active={previewPlaying}
				aria-label={previewPlaying ? 'Pause' : 'Play guided tour'}
				title={previewPlaying ? 'Pause' : 'Play the complete guided tour'}
				disabled={tourTransportDisabled}
				onclick={toggleTourPlayback}
			>{previewPlaying ? '❚❚' : '▶'}</button>
			<button
				type="button"
				aria-label="Next camera boundary"
				disabled={disabled || store.cameraTimelinePlayhead >= 1}
				onclick={() => store.stepCameraTimeline(1)}
			>▶│</button>
			<output aria-label="Camera timeline time">
				{formatTime(timeline.durationSeconds * store.cameraTimelinePlayhead)}
			</output>
			<label class="scrubber">
				<span>Tour playhead</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.0005"
					value={store.cameraTimelinePlayhead}
					disabled={disabled}
					oninput={scrub}
				/>
			</label>
			<button
				type="button"
				class="add-key"
				disabled={!store.canAddViewKeyframeAtPlayhead}
				onclick={() => store.addViewKeyframeAtPlayhead()}
			>+ Camera Key</button>
		</div>

		{#if store.cameraPreview}
			<EditorCameraPreviewControls {store} />
		{/if}

		<div class="lanes">
			<div class="lane-label">
				<strong>Guided Route</strong>
				<span>{timeline.edges.length} edges</span>
			</div>
			<div class="track route-track" aria-label="Guided Route">
				<div class="rail"></div>
				{#each timeline.edges as edge (edge.connectionId)}
					{@const start = edge.startSeconds / timeline.durationSeconds}
					{@const end = edge.endSeconds / timeline.durationSeconds}
					<button
						type="button"
						class="edge"
						class:selected={isEdgeSelected(edge)}
						style={`left: ${percent(start)}; width: ${percent(end - start)};`}
						title={`${edge.connectionId} · ${edge.direction}`}
						disabled={disabled}
						onclick={(event) => selectEdge(event, edge)}
					>
						<span>{edge.connectionId}</span>
					</button>
				{/each}
				{#each timeline.nodeBoundaries as boundary (`${boundary.boundaryIndex}:${boundary.nodeId}`)}
					{@const node = store.document.navigationNodes.find((candidate) => candidate.id === boundary.nodeId)}
					<button
						type="button"
						class="diamond node"
						class:selected={isNodeSelected(boundary.nodeId)}
						style={`left: ${percent(boundary.progress)};`}
						title={`${node?.label ?? boundary.nodeId} · ${formatTime(boundary.timeSeconds)}`}
						aria-label={`Select camera node ${node?.label ?? boundary.nodeId}`}
						disabled={disabled}
						onclick={(event) => {
							event.stopPropagation();
							store.selectCameraTimelineNode(boundary.nodeId, boundary.boundaryIndex);
						}}
					>◆</button>
				{/each}
				<div class="playhead" style={`left: ${percent(store.cameraTimelinePlayhead)};`}></div>
			</div>

			<div class="lane-label">
				<strong>Camera Framing</strong>
				<span title={activeTrackLabel}>{activeTrackLabel}</span>
			</div>
			<div bind:this={framingTrackElement} class="track framing-track" aria-label="Camera Framing">
				<div class="rail"></div>
				{#if viewKeyMarkers.length === 0}
					<span class="no-keys">No camera keys on visible tracks</span>
				{/if}
				{#each viewKeyMarkers as marker (`${marker.connectionId}:${marker.direction}:${marker.keyframeId}`)}
					<button
						type="button"
						class="diamond key"
						class:selected={isKeySelected(marker)}
						class:reverse={marker.direction === 'reverse'}
						class:dragging={isKeyDragging(marker)}
						style={`left: ${percent(marker.progress)};`}
						title={`${marker.keyframeId} · ${marker.direction}`}
						aria-label={`Select camera key ${marker.keyframeId}`}
						disabled={disabled && !isKeyDragging(marker)}
						aria-grabbed={isKeyDragging(marker)}
						onpointerdown={(event) => beginKeyDrag(event, marker)}
						onpointermove={updateKeyDrag}
						onpointerup={commitKeyDrag}
						onpointercancel={cancelKeyDragPointer}
						onlostpointercapture={cancelKeyDragPointer}
						onclick={(event) => {
							event.stopPropagation();
							store.selectCameraTimelineViewKeyframe(
								marker.connectionId,
								marker.direction,
								marker.keyframeId
							);
						}}
					>◇</button>
				{/each}
				<div class="playhead" style={`left: ${percent(store.cameraTimelinePlayhead)};`}></div>
			</div>
		</div>
	</div>
{:else}
	<div class="timeline-error" role="status">
		<strong>Guided timeline unavailable</strong>
		<span>Repair the guided camera cycle to continue.</span>
	</div>
{/if}

<style>
	.timeline-panel { display: flex; min-height: 0; flex-direction: column; gap: 0.55rem; }
	.transport { display: flex; min-width: 0; align-items: center; gap: 0.4rem; }
	.transport button,
	.timeline-panel :global(.preview-transport button) {
		padding: 0.34rem 0.48rem; border: 1px solid #3a3a46; border-radius: 0.3rem;
		background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.transport button:hover:not(:disabled) { border-color: #d6b35f; }
	.transport button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.transport button:disabled { opacity: 0.38; cursor: default; }
	.transport .add-key { border-color: #6f5d32; color: #f4dc9b; white-space: nowrap; }
	output { min-width: 4.8rem; color: #f4efe4; font: 650 0.72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
	.scrubber { display: flex; min-width: 8rem; flex: 1; align-items: center; gap: 0.45rem; }
	.scrubber span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.scrubber input { width: 100%; margin: 0; accent-color: #d6b35f; }
	.lanes { display: grid; min-height: 6.9rem; grid-template-columns: 9.5rem minmax(30rem, 1fr); grid-template-rows: repeat(2, minmax(3.25rem, 1fr)); overflow-x: auto; }
	.lane-label { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 0.2rem; padding: 0.35rem 0.7rem 0.35rem 0; border-top: 1px solid #262630; }
	.lane-label strong { color: #d5cec2; font-size: 0.68rem; }
	.lane-label span { overflow: hidden; color: #77736d; font-size: 0.58rem; text-overflow: ellipsis; white-space: nowrap; }
	.track { position: relative; min-width: 30rem; border-top: 1px solid #262630; }
	.rail { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #4a4852; }
	.edge { position: absolute; top: 50%; z-index: 1; height: 1.55rem; min-width: 1px; transform: translateY(-50%); overflow: hidden; padding: 0 0.25rem; border: 0; border-left: 1px solid #6a6772; background: rgb(78 76 88 / 42%); color: #aaa5af; font: 0.54rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: left; cursor: crosshair; }
	.edge:hover:not(:disabled), .edge.selected { background: rgb(159 125 55 / 42%); color: #fff2c7; }
	.edge span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.diamond { position: absolute; top: 50%; z-index: 3; width: 1.25rem; height: 1.75rem; transform: translate(-50%, -50%); padding: 0; border: 0; background: transparent; color: #c7c1b8; font: 0.78rem/1 sans-serif; cursor: pointer; }
	.diamond:hover:not(:disabled), .diamond.selected { color: #ffe08a; text-shadow: 0 0 8px rgb(255 213 104 / 72%); }
	.diamond.key { color: #79d8ff; }
	.diamond.key.reverse { color: #d6a2ff; }
	.diamond.key.selected { color: #fff; }
	.diamond.key.dragging { color: #fff; cursor: grabbing; text-shadow: 0 0 10px rgb(121 216 255 / 90%); }
	.playhead { position: absolute; top: 0; bottom: 0; z-index: 2; width: 1px; transform: translateX(-0.5px); background: #e7c87a; pointer-events: none; box-shadow: 0 0 5px rgb(231 200 122 / 45%); }
	.no-keys { position: absolute; top: 50%; left: 0.6rem; transform: translateY(-50%); color: #5f5b56; font-size: 0.6rem; }
	.timeline-error { display: flex; height: 100%; min-height: 7rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; color: #a8a29a; text-align: center; }
	.timeline-error strong { color: #d5cec2; font-size: 0.78rem; }
	.timeline-error span { font-size: 0.68rem; }

	@media (max-width: 44rem) {
		.transport { flex-wrap: wrap; }
		.scrubber { order: 2; flex-basis: 100%; }
		.lanes { grid-template-columns: 7rem minmax(30rem, 1fr); }
	}
</style>
