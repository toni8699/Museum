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
	import {
		CAMERA_FRAMING_AUTHORING_COMFORT,
		clampRampEdgeProgress,
		ENVELOPE_HANDLE_LABELS,
		ENVELOPE_HANDLE_NAMES,
		type EnvelopeHandleName
	} from './editor-camera-framing-authoring';
	import {
		cameraMotionProgressAtEdgeProgress,
		createCameraMotionSample,
		sampleCameraMotion
	} from '$lib/museum/navigation/camera-motion';
	import type { CameraFramingEnvelope } from '$lib/content/scene';

	let { store, viewMode = '3d' }: { store: MuseumEditorStore; viewMode?: 'plan' | '3d' } = $props();

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

	// ===================================================================
	// P1.6 — Envelope band rendering (viewMode-gated)
	// ===================================================================

	type EnvelopeBand = {
		connectionId: string;
		direction: CameraConnectionDirection;
		/** Timeline progress [0..1] for each envelope bound. */
		enterStart: number;
		enterEnd: number;
		exitStart: number;
		exitEnd: number;
	};

	const envelopeBands = $derived.by((): EnvelopeBand[] => {
		if (viewMode !== '3d' || !timeline) return [];
		const bands: EnvelopeBand[] = [];
		for (const edge of timeline.edges) {
			const direction = edgeDirection(edge);
			const connection = store.document.connections.find(
				(candidate) => candidate.id === edge.connectionId
			);
			const envelope = connection?.viewTracks?.framingEnvelope?.[direction];
			if (!envelope) continue;
			const enterStart = cameraTimelineProgressAtEdgeProgress(
				timeline, edge.connectionId, direction, envelope.enterStart
			);
			const enterEnd = cameraTimelineProgressAtEdgeProgress(
				timeline, edge.connectionId, direction, envelope.enterEnd
			);
			const exitStart = cameraTimelineProgressAtEdgeProgress(
				timeline, edge.connectionId, direction, envelope.exitStart
			);
			const exitEnd = cameraTimelineProgressAtEdgeProgress(
				timeline, edge.connectionId, direction, envelope.exitEnd
			);
			if (enterStart === null || enterEnd === null || exitStart === null || exitEnd === null) continue;
			bands.push({
				connectionId: edge.connectionId,
				direction,
				enterStart,
				enterEnd,
				exitStart,
				exitEnd
			});
		}
		return bands;
	});

	// ===================================================================
	// P1.6 — Envelope handles (drag + keyboard, viewMode-gated)
	// ===================================================================

	type ActiveEnvelopeHandles = {
		connectionId: string;
		direction: CameraConnectionDirection;
		edge: EditorCameraTimelineEdge;
		envelope: CameraFramingEnvelope;
		positions: Record<EnvelopeHandleName, number>;
	};

	const activeEnvelopeHandles = $derived.by((): ActiveEnvelopeHandles | null => {
		if (viewMode !== '3d' || !timeline) return null;
		const connectionId = store.activeCameraConnectionId;
		if (!connectionId) return null;
		const direction = store.activeCameraDirection;
		const connection = store.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		const envelope = connection?.viewTracks?.framingEnvelope?.[direction];
		if (!envelope) return null;
		const edge = timeline.edges.find(
			(candidate) =>
				candidate.connectionId === connectionId &&
				edgeDirection(candidate) === direction
		);
		if (!edge) return null;
		const positions = {} as Record<EnvelopeHandleName, number>;
		for (const handle of ENVELOPE_HANDLE_NAMES) {
			const progress = cameraTimelineProgressAtEdgeProgress(
				timeline,
				connectionId,
				direction,
				envelope[handle]
			);
			if (progress === null) return null;
			positions[handle] = progress;
		}
		return { connectionId, direction, edge, envelope, positions };
	});

	let envelopeHandleDrag = $state<{
		pointerId: number;
		target: HTMLElement;
		connectionId: string;
		direction: CameraConnectionDirection;
		handle: EnvelopeHandleName;
	} | null>(null);

	function isEnvelopeHandleDragging(handle: EnvelopeHandleName) {
		return Boolean(envelopeHandleDrag && envelopeHandleDrag.handle === handle);
	}

	function releaseEnvelopeHandleCapture(active: NonNullable<typeof envelopeHandleDrag>) {
		if (active.target.hasPointerCapture(active.pointerId)) {
			active.target.releasePointerCapture(active.pointerId);
		}
	}

	function cancelEnvelopeHandleDrag() {
		const active = envelopeHandleDrag;
		if (!active) return false;
		envelopeHandleDrag = null;
		releaseEnvelopeHandleCapture(active);
		store.cancelFramingEnvelopeHandleDrag();
		return true;
	}

	function clampOrderedHandleValue(
		envelope: CameraFramingEnvelope,
		handle: EnvelopeHandleName,
		value: number
	): number {
		const clamped = Math.min(1, Math.max(0, value));
		switch (handle) {
			case 'enterStart':
				return Math.min(clamped, envelope.enterEnd);
			case 'enterEnd':
				return Math.min(Math.max(clamped, envelope.enterStart), envelope.exitStart);
			case 'exitStart':
				return Math.min(Math.max(clamped, envelope.enterEnd), envelope.exitEnd);
			case 'exitEnd':
				return Math.max(clamped, envelope.exitStart);
		}
	}

	function fixedBoundForHandle(
		envelope: CameraFramingEnvelope,
		handle: EnvelopeHandleName
	): number {
		switch (handle) {
			case 'enterStart':
				return envelope.enterEnd;
			case 'enterEnd':
				return envelope.enterStart;
			case 'exitStart':
				return envelope.exitEnd;
			case 'exitEnd':
				return envelope.exitStart;
		}
	}

	function clampComfortRamp(
		active: NonNullable<typeof envelopeHandleDrag>,
		edge: EditorCameraTimelineEdge,
		envelope: CameraFramingEnvelope,
		proposedEdgeProgress: number
	): number {
		const motion = edge.motions[active.direction];
		if (!motion) return proposedEdgeProgress;
		const fixed = fixedBoundForHandle(envelope, active.handle);
		if (proposedEdgeProgress === fixed) return proposedEdgeProgress;
		const mapProgress = (p: number) =>
			cameraMotionProgressAtEdgeProgress(motion, 0, p);
		const sample = createCameraMotionSample();
		const fovAt = (p: number) => {
			sampleCameraMotion(motion, mapProgress(p), sample);
			return sample.fov;
		};
		const a = Math.min(fixed, proposedEdgeProgress);
		const b = Math.max(fixed, proposedEdgeProgress);
		if (Math.abs(fovAt(b) - fovAt(a)) < 1e-3) return proposedEdgeProgress;
		return clampRampEdgeProgress(
			fixed,
			proposedEdgeProgress,
			mapProgress,
			motion.durationSeconds,
			CAMERA_FRAMING_AUTHORING_COMFORT.minFovRampSeconds
		);
	}

	function beginEnvelopeHandleDrag(
		event: PointerEvent,
		connectionId: string,
		direction: CameraConnectionDirection,
		handle: EnvelopeHandleName
	) {
		if (event.button !== 0 || disabled || envelopeHandleDrag) return;
		if (!store.beginFramingEnvelopeHandleDrag(connectionId, direction)) return;
		const target = event.currentTarget as HTMLElement;
		envelopeHandleDrag = { pointerId: event.pointerId, target, connectionId, direction, handle };
		target.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopPropagation();
	}

	function updateEnvelopeHandleDrag(event: PointerEvent) {
		const active = envelopeHandleDrag;
		if (
			!active ||
			event.pointerId !== active.pointerId ||
			!timeline ||
			!framingTrackElement
		) {
			return;
		}
		const rect = framingTrackElement.getBoundingClientRect();
		const rulerProgress =
			rect.width > 0 ? (event.clientX - rect.left) / rect.width : playhead;
		const edgeProgress = cameraTimelineEdgeProgressAtProgress(
			timeline,
			active.connectionId,
			active.direction,
			rulerProgress
		);
		if (edgeProgress === null) return;
		const connection = store.document.connections.find(
			(candidate) => candidate.id === active.connectionId
		);
		const envelope = connection?.viewTracks?.framingEnvelope?.[active.direction];
		const edge = timeline.edges.find(
			(candidate) =>
				candidate.connectionId === active.connectionId &&
				edgeDirection(candidate) === active.direction
		);
		if (!envelope || !edge) return;
		const ordered = clampOrderedHandleValue(envelope, active.handle, edgeProgress);
		const clamped = event.altKey
			? ordered
			: clampComfortRamp(active, edge, envelope, ordered);
		store.updateFramingEnvelopeHandleDrag(
			active.connectionId,
			active.direction,
			active.handle,
			clamped
		);
		event.preventDefault();
		event.stopPropagation();
	}

	function commitEnvelopeHandleDrag(event: PointerEvent) {
		const active = envelopeHandleDrag;
		if (!active || event.pointerId !== active.pointerId || event.button !== 0) return;
		envelopeHandleDrag = null;
		releaseEnvelopeHandleCapture(active);
		store.commitFramingEnvelopeHandleDrag();
		event.preventDefault();
		event.stopPropagation();
	}

	function cancelEnvelopeHandleDragPointer(event: PointerEvent) {
		if (envelopeHandleDrag?.pointerId !== event.pointerId) return;
		cancelEnvelopeHandleDrag();
	}

	function handleKeydown(
		event: KeyboardEvent,
		connectionId: string,
		direction: CameraConnectionDirection,
		handle: EnvelopeHandleName
	) {
		if (disabled) return;
		const connection = store.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		const envelope = connection?.viewTracks?.framingEnvelope?.[direction];
		if (!envelope) return;

		let nextValue: number;
		if (event.key === 'Home') {
			nextValue = clampOrderedHandleValue(envelope, handle, 0);
		} else if (event.key === 'End') {
			nextValue = clampOrderedHandleValue(envelope, handle, 1);
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
			const step = event.shiftKey ? 0.05 : 0.01;
			nextValue = clampOrderedHandleValue(envelope, handle, envelope[handle] - step);
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
			const step = event.shiftKey ? 0.05 : 0.01;
			nextValue = clampOrderedHandleValue(envelope, handle, envelope[handle] + step);
		} else {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (Math.abs(nextValue - envelope[handle]) < 1e-9) return;
		store.commitEnvelopeHandle(connectionId, direction, { ...envelope, [handle]: nextValue });
	}

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
			store.activeCameraDirection === 'reverse' &&
				store.activeCameraConnectionId === edge.connectionId
				? 'reverse'
				: edge.direction,
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

	$effect(() => {
		const active = envelopeHandleDrag;
		if (
			active &&
			(active.connectionId !== store.activeCameraConnectionId ||
				active.direction !== store.activeCameraDirection)
		) {
			cancelEnvelopeHandleDrag();
		}
	});

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			const cancelled = cancelKeyDrag() || cancelEnvelopeHandleDrag();
			if (!cancelled) return;
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		const onBlur = () => {
			cancelKeyDrag();
			cancelEnvelopeHandleDrag();
		};
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('blur', onBlur);
		return () => {
			cancelKeyDrag();
			cancelEnvelopeHandleDrag();
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
			{#each timeline.edges as edge (`${edge.connectionId}:${edge.direction}`)}
				{@const start = edge.motionStartSeconds / timeline.durationSeconds}
				{@const end = edge.motionEndSeconds / timeline.durationSeconds}
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
			<div class="playhead" style={`left: ${percent(playhead)};`}></div>
		</div>

		<div class="lane-label">
			<strong>Camera Framing</strong>
			<span title={activeTrackLabel}>{activeTrackLabel}</span>
		</div>
		<div bind:this={framingTrackElement} class="track framing-track" aria-label="Camera Framing">
			<div class="rail"></div>

			<!-- P1.6 — Envelope influence bands (viewMode === '3d' only) -->
			{#each envelopeBands as band (`${band.connectionId}:${band.direction}`)}
				{@const isActive = store.activeCameraConnectionId === band.connectionId && store.activeCameraDirection === band.direction}
				<!-- Automatic region: 0 → enterStart -->
				{#if band.enterStart > 0}
					<div
						class="envelope-band auto"
						class:active-edge={isActive}
						style={`left: 0; width: ${percent(band.enterStart)};`}
						aria-hidden="true"
					></div>
				{/if}
				<!-- Enter blend: enterStart → enterEnd -->
				<div
					class="envelope-band blend"
					class:active-edge={isActive}
					style={`left: ${percent(band.enterStart)}; width: ${percent(band.enterEnd - band.enterStart)};`}
					aria-hidden="true"
				></div>
				<!-- Authored plateau: enterEnd → exitStart -->
				{#if band.exitStart > band.enterEnd}
					<div
						class="envelope-band authored"
						class:active-edge={isActive}
						style={`left: ${percent(band.enterEnd)}; width: ${percent(band.exitStart - band.enterEnd)};`}
						aria-hidden="true"
					></div>
				{/if}
				<!-- Exit blend: exitStart → exitEnd -->
				<div
					class="envelope-band blend"
					class:active-edge={isActive}
					style={`left: ${percent(band.exitStart)}; width: ${percent(band.exitEnd - band.exitStart)};`}
					aria-hidden="true"
				></div>
				<!-- Automatic region: exitEnd → 1 -->
				{#if band.exitEnd < 1}
					<div
						class="envelope-band auto"
						class:active-edge={isActive}
						style={`left: ${percent(band.exitEnd)}; width: ${percent(1 - band.exitEnd)};`}
						aria-hidden="true"
					></div>
				{/if}
			{/each}

			<!-- P1.6 — Envelope handles for the active connection+direction -->
			{#if activeEnvelopeHandles}
				{#each ENVELOPE_HANDLE_NAMES as handle (handle)}
					<button
						type="button"
						class="envelope-handle"
						class:dragging={isEnvelopeHandleDragging(handle)}
						style={`left: ${percent(activeEnvelopeHandles.positions[handle])};`}
						aria-label={ENVELOPE_HANDLE_LABELS[handle]}
						title={ENVELOPE_HANDLE_LABELS[handle]}
						disabled={disabled && !isEnvelopeHandleDragging(handle)}
						onpointerdown={(event) =>
							beginEnvelopeHandleDrag(
								event,
								activeEnvelopeHandles.connectionId,
								activeEnvelopeHandles.direction,
								handle
							)}
						onpointermove={updateEnvelopeHandleDrag}
						onpointerup={commitEnvelopeHandleDrag}
						onpointercancel={cancelEnvelopeHandleDragPointer}
						onlostpointercapture={cancelEnvelopeHandleDragPointer}
						onkeydown={(event) =>
							handleKeydown(
								event,
								activeEnvelopeHandles.connectionId,
								activeEnvelopeHandles.direction,
								handle
							)}
						onclick={(event) => event.stopPropagation()}
					></button>
				{/each}
			{/if}

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
	.edge span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.diamond { position: absolute; top: 50%; z-index: 3; width: 1.25rem; height: 1.75rem; transform: translate(-50%, -50%); padding: 0; border: 0; background: transparent; color: #c7c1b8; font: 0.78rem/1 sans-serif; cursor: pointer; }
	.diamond:hover:not(:disabled), .diamond.selected { color: #ffe08a; text-shadow: 0 0 8px rgb(255 213 104 / 72%); }
	.diamond.key { color: #79d8ff; }
	.diamond.key.reverse { color: #d6a2ff; }
	.diamond.key.selected { color: #fff; }
	.diamond.key.dragging { color: #fff; cursor: grabbing; text-shadow: 0 0 10px rgb(121 216 255 / 90%); }
	.playhead { position: absolute; top: 0; bottom: 0; z-index: 2; width: 1px; transform: translateX(-0.5px); background: #e7c87a; pointer-events: none; box-shadow: 0 0 5px rgb(231 200 122 / 45%); }
	.no-keys { position: absolute; top: 50%; left: 0.6rem; transform: translateY(-50%); color: #5f5b56; font-size: 0.6rem; }

	/* P1.6 — envelope influence bands */
	.envelope-band { position: absolute; top: 0; bottom: 0; pointer-events: none; }
	.envelope-band.auto { background: rgb(74 72 82 / 18%); }
	.envelope-band.blend { background: rgb(180 150 60 / 22%); }
	.envelope-band.authored { background: rgb(200 170 70 / 35%); }
	.envelope-band.active-edge.auto { background: rgb(74 72 82 / 28%); }
	.envelope-band.active-edge.blend { background: rgb(200 170 70 / 30%); }
	.envelope-band.active-edge.authored { background: rgb(214 179 95 / 45%); }

	/* P1.6 — envelope handles */
	.envelope-handle { position: absolute; top: 50%; z-index: 4; width: 0.6rem; height: 1.5rem; transform: translate(-50%, -50%); padding: 0; border: 1px solid #d6b35f; border-radius: 2px; background: #2a2618; cursor: ew-resize; }
	.envelope-handle:hover:not(:disabled), .envelope-handle.dragging { border-color: #ffe08a; background: #fff2c7; }
	.envelope-handle:disabled { opacity: 0.35; cursor: default; }

	@media (max-width: 44rem) {
		.lanes { grid-template-columns: 7rem minmax(30rem, 1fr); }
	}
</style>
