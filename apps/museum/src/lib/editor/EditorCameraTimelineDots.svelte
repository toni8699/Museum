<script lang="ts">
	import { onMount } from 'svelte';
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import {
		cameraTimelineEdgeProgressAtProgress,
		cameraTimelineProgressAtEdgeProgress,
		type EditorCameraTimeline,
		type EditorCameraTimelineEdge
	} from './editor-camera-timeline';
	import { useCameraTimeline } from './hooks/use-camera-timeline.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	type TimelineViewKeyMarker = {
		connectionId: string;
		direction: CameraConnectionDirection;
		keyframeId: string;
		progress: number;
	};

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const playhead = $derived(timelineApi.playhead);
	const disabled = $derived(timelineApi.disabled);
	const selected = $derived(store.navigationSelection);
	const dragConnectDisabled = $derived(
		disabled || store.pendingNavigationCommand !== null
	);
	const activeTrackLabel = $derived(
		store.activeCameraConnectionId
			? `${store.activeCameraDirection === 'forward' ? '▶' : '◀'} ${store.activeCameraConnectionId}`
			: 'Guided directions'
	);

	let framingTrackElement = $state<HTMLElement>();
	let keyDrag = $state<{
		pointerId: number;
		target: HTMLElement;
		marker: TimelineViewKeyMarker;
	} | null>(null);
	let draggedTimelineNodeId = $state<string | null>(null);
	let dragOverConnectionId = $state<string | null>(null);

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

	function selectEdge(event: MouseEvent, edge: EditorCameraTimelineEdge) {
		if (!timeline) return;
		event.stopPropagation();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const localProgress = rect.width > 0
			? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
			: 0;
		const start = edge.motionStartSeconds / timeline.durationSeconds;
		const end = edge.motionEndSeconds / timeline.durationSeconds;
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

	function beginTimelineNodeDrag(event: DragEvent, nodeId: string) {
		if (dragConnectDisabled || nodeId === timeline?.startNodeId) {
			event.preventDefault();
			return;
		}
		draggedTimelineNodeId = nodeId;
		event.dataTransfer?.setData('application/x-museum-camera-node', nodeId);
		event.dataTransfer?.setData('text/plain', nodeId);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function finishTimelineNodeDrag() {
		draggedTimelineNodeId = null;
		dragOverConnectionId = null;
	}

	function allowTimelineEdgeDrop(event: DragEvent, edge: EditorCameraTimelineEdge) {
		if (dragConnectDisabled) return;
		const types = Array.from(event.dataTransfer?.types ?? []);
		if (
			!draggedTimelineNodeId &&
			!types.includes('application/x-museum-camera-node') &&
			!types.includes('text/plain')
		) {
			return;
		}
		event.preventDefault();
		dragOverConnectionId = edge.connectionId;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function leaveTimelineEdge(edge: EditorCameraTimelineEdge) {
		if (dragOverConnectionId === edge.connectionId) dragOverConnectionId = null;
	}

	function dropNodeOnTimelineEdge(event: DragEvent, edge: EditorCameraTimelineEdge) {
		event.preventDefault();
		const nodeId =
			draggedTimelineNodeId ||
			event.dataTransfer?.getData('application/x-museum-camera-node') ||
			event.dataTransfer?.getData('text/plain');
		finishTimelineNodeDrag();
		if (!nodeId || dragConnectDisabled) return;
		store.timelineDragConnectNode(nodeId, edge.fromNodeId, edge.toNodeId);
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
			: playhead;
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
	<div class="lanes">
		<div class="lane-label">
			<strong>Guided Route</strong>
			<span>{timeline.edges.length} edges</span>
		</div>
		<div class="track route-track" aria-label="Guided Route">
			<div class="rail"></div>
			{#each timeline.edges as edge (edge.connectionId)}
				{@const start = edge.motionStartSeconds / timeline.durationSeconds}
				{@const end = edge.motionEndSeconds / timeline.durationSeconds}
				<button
					type="button"
					class="edge"
					class:selected={isEdgeSelected(edge)}
					class:drop-target={dragOverConnectionId === edge.connectionId}
					style={`left: ${percent(start)}; width: ${percent(end - start)};`}
					title={`${edge.connectionId} · ${edge.direction} · drop a camera node here to insert it`}
					disabled={disabled}
					ondragover={(event) => allowTimelineEdgeDrop(event, edge)}
					ondragleave={() => leaveTimelineEdge(edge)}
					ondrop={(event) => dropNodeOnTimelineEdge(event, edge)}
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
					draggable={boundary.nodeId !== timeline.startNodeId && !dragConnectDisabled}
					aria-grabbed={draggedTimelineNodeId === boundary.nodeId}
					ondragstart={(event) => beginTimelineNodeDrag(event, boundary.nodeId)}
					ondragend={finishTimelineNodeDrag}
					onclick={(event) => {
						event.stopPropagation();
						store.selectCameraTimelineNode(boundary.nodeId, boundary.boundaryIndex);
					}}
				>◆</button>
			{/each}
			<div class="playhead" style={`left: ${percent(playhead)};`}></div>
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
			<div class="playhead" style={`left: ${percent(playhead)};`}></div>
		</div>
	</div>
{/if}

<style>
	.lanes { display: grid; min-height: 6.9rem; grid-template-columns: 9.5rem minmax(30rem, 1fr); grid-template-rows: repeat(2, minmax(3.25rem, 1fr)); overflow-x: auto; }
	.lane-label { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 0.2rem; padding: 0.35rem 0.7rem 0.35rem 0; border-top: 1px solid #262630; }
	.lane-label strong { color: #d5cec2; font-size: 0.68rem; }
	.lane-label span { overflow: hidden; color: #77736d; font-size: 0.58rem; text-overflow: ellipsis; white-space: nowrap; }
	.track { position: relative; min-width: 30rem; border-top: 1px solid #262630; }
	.rail { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #4a4852; }
	.edge { position: absolute; top: 50%; z-index: 1; height: 1.55rem; min-width: 1px; transform: translateY(-50%); overflow: hidden; padding: 0 0.25rem; border: 0; border-left: 1px solid #6a6772; background: rgb(78 76 88 / 42%); color: #aaa5af; font: 0.54rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: left; cursor: crosshair; }
	.edge:hover:not(:disabled), .edge.selected { background: rgb(159 125 55 / 42%); color: #fff2c7; }
	.edge.drop-target { background: rgb(96 160 116 / 55%); color: #f2ffe9; box-shadow: inset 0 0 0 1px #83c797; }
	.edge span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.diamond { position: absolute; top: 50%; z-index: 3; width: 1.25rem; height: 1.75rem; transform: translate(-50%, -50%); padding: 0; border: 0; background: transparent; color: #c7c1b8; font: 0.78rem/1 sans-serif; cursor: pointer; }
	.diamond:hover:not(:disabled), .diamond.selected { color: #ffe08a; text-shadow: 0 0 8px rgb(255 213 104 / 72%); }
	.diamond.node[draggable='true'] { cursor: grab; }
	.diamond.node[aria-grabbed='true'] { cursor: grabbing; }
	.diamond.key { color: #79d8ff; }
	.diamond.key.reverse { color: #d6a2ff; }
	.diamond.key.selected { color: #fff; }
	.diamond.key.dragging { color: #fff; cursor: grabbing; text-shadow: 0 0 10px rgb(121 216 255 / 90%); }
	.playhead { position: absolute; top: 0; bottom: 0; z-index: 2; width: 1px; transform: translateX(-0.5px); background: #e7c87a; pointer-events: none; box-shadow: 0 0 5px rgb(231 200 122 / 45%); }
	.no-keys { position: absolute; top: 50%; left: 0.6rem; transform: translateY(-50%); color: #5f5b56; font-size: 0.6rem; }

	@media (max-width: 44rem) {
		.lanes { grid-template-columns: 7rem minmax(30rem, 1fr); }
	}
</style>
