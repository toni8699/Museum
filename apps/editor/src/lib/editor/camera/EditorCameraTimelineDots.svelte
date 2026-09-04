<script lang="ts">
	import { onMount } from 'svelte';
	import { Aperture, Clapperboard, Crosshair, Route, RotateCw } from 'lucide-svelte';
	import type { CameraConnectionDirection } from '$lib/types/scene';
	import { isFlowNode } from '$lib/content/scene';
	import {
		cameraTimelineEdgeProgressAtProgress,
		cameraTimelineProgressAtEdgeProgress,
		type EdgeLocalTimeline,
		type EditorCameraTimeline,
		type EditorCameraTimelineEdge
	} from './editor-camera-timeline';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';
	import type { EditorStore } from '../editor-store.svelte';
	import type { EditorContextMenuStore } from '../context-menu/context-menu-state.svelte';
	import {
		buildCameraNodeContextMenuItems,
		buildCameraConnectionContextMenuItems,
		buildViewKeyframeContextMenuItems
	} from '../context-menu/camera-menu-items';
	import { isEditableTarget } from '../context-menu/editable-target';
	import {
		validateConnectionDeletion,
		validateGuidedTourRemoval,
		validateNavigationNodeDeletion
	} from '../editor-navigation-graph';
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
		sampleCameraMotion,
		type Vector3Like
	} from '@portfolio/camera-core';
	import type { CameraFramingEnvelope } from '$lib/content/scene';

	let {
		store,
		viewMode = '3d',
		contextMenu = null,
		edgeTimeline = null
	}: {
		store: EditorStore;
		viewMode?: 'plan' | '3d';
		contextMenu?: EditorContextMenuStore | null;
		edgeTimeline?: EdgeLocalTimeline | null;
	} = $props();

	type TimelineViewKeyMarker = {
		connectionId: string;
		direction: CameraConnectionDirection;
		keyframeId: string;
		progress: number;
		fov: number;
		cameraTarget: readonly [number, number, number];
	};

	type TimelineShotSegment = {
		nodeId: string;
		boundaryIndex: number;
		label: string;
		start: number;
		end: number;
		holdSeconds: number;
	};

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const playhead = $derived(timelineApi.playhead);
	const edgePlayhead = $derived(timelineApi.edgePlayhead);
	const selectionDisabled = $derived(timelineApi.selectionDisabled);
	const framingDisabled = $derived(timelineApi.framingDisabled);
	const selected = $derived(store.navigationSelection);
	const activeTrackLabel = $derived(
		store.activeCameraConnectionId
			? `${store.activeCameraDirection === 'forward' ? '▶' : '◀'} ${store.activeCameraConnectionId}`
			: 'Guided directions'
	);

	let framingTrackElement = $state<HTMLElement>();
	let scrubTrackElement = $state<HTMLElement>();
	let scrubDrag = $state<{ pointerId: number; target: HTMLElement; edge: boolean } | null>(null);
	let keyDrag = $state<{
		pointerId: number;
		target: HTMLElement;
		marker: TimelineViewKeyMarker;
	} | null>(null);

	function scrubProgress(event: PointerEvent, element: HTMLElement, fallback: number) {
		const rect = element.getBoundingClientRect();
		return rect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : fallback;
	}

	function timelineScrubDisabled(edge: boolean) {
		return store.isRelic || (edge ? timelineApi.edgeScrubDisabled : timelineApi.scrubDisabled);
	}

	function seekTimeline(progress: number, edge: boolean) {
		if (timelineApi.previewPlaying) store.pauseCameraPreview();
		if (edge) timelineApi.seekEdge(progress);
		else timelineApi.seek(progress);
	}

	function isTimelineInteractiveTarget(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest(
			'button, a, input, select, textarea, [role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [data-timeline-interactive]'
		));
	}

	function beginTimelineScrub(event: PointerEvent, edge: boolean) {
		if (
			event.button !== 0 ||
			timelineScrubDisabled(edge) ||
			scrubDrag ||
			!scrubTrackElement ||
			isTimelineInteractiveTarget(event.target)
		) return;
		const target = event.currentTarget as HTMLElement;
		scrubDrag = { pointerId: event.pointerId, target, edge };
		target.setPointerCapture(event.pointerId);
		const progress = scrubProgress(event, scrubTrackElement, edge ? edgePlayhead : playhead);
		seekTimeline(progress, edge);
		event.preventDefault();
	}

	function updateTimelineScrub(event: PointerEvent) {
		const active = scrubDrag;
		if (!active || event.pointerId !== active.pointerId) return;
		if (!scrubTrackElement) return;
		const progress = scrubProgress(event, scrubTrackElement, active.edge ? edgePlayhead : playhead);
		seekTimeline(progress, active.edge);
		event.preventDefault();
	}

	function endTimelineScrub(event: PointerEvent) {
		if (!scrubDrag || event.pointerId !== scrubDrag.pointerId) return;
		const active = scrubDrag;
		scrubDrag = null;
		if (active.target.hasPointerCapture(event.pointerId)) active.target.releasePointerCapture(event.pointerId);
	}

	function cancelTimelineScrub() {
		if (!scrubDrag) return;
		scrubDrag = null;
	}

	function handlePlayheadKeydown(event: KeyboardEvent, edge: boolean) {
		const current = edge ? edgePlayhead : playhead;
		let next = current;
		if (event.key === 'ArrowLeft') next = Math.max(0, current - 0.01);
		else if (event.key === 'ArrowRight') next = Math.min(1, current + 0.01);
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = 1;
		else return;
		event.preventDefault();
		seekTimeline(next, edge);
	}

	function vectorTuple(value: Vector3Like): readonly [number, number, number] {
		return 'x' in value ? [value.x, value.y, value.z] : [value[0], value[1], value[2]];
	}

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
					progress,
					fov: keyframe.fov,
					cameraTarget: keyframe.cameraTarget
				});
			}
		}
		return markers;
	}

	const viewKeyMarkers = $derived(readViewKeyMarkers(timeline));
	type EdgeTimelineViewKeyMarker = {
		keyframeId: string;
		timeProgress: number;
		timeSeconds: number;
		fov: number;
		cameraTarget: readonly [number, number, number];
	};

	const edgeViewKeyMarkers = $derived.by((): EdgeTimelineViewKeyMarker[] => {
		if (!edgeTimeline) return [];
		const keyframes = edgeTimeline.motion.positionEdgeSpans[0]?.viewTrack?.keyframes ?? [];
		return keyframes.flatMap((keyframe) => {
			const timeProgress = cameraMotionProgressAtEdgeProgress(
				edgeTimeline.motion,
				0,
				keyframe.progress
			);
			if (!Number.isFinite(timeProgress)) return [];
			return [{
				keyframeId: keyframe.id,
				timeProgress,
				timeSeconds: timeProgress * edgeTimeline.durationSeconds,
				fov: keyframe.fov,
				cameraTarget: vectorTuple(keyframe.cameraTarget)
			}];
		});
	});
	const edgeTimeTicks = $derived.by(() => {
		if (!edgeTimeline) return [];
		return timeTicksForDuration(edgeTimeline.durationSeconds);
	});
	const edgeLabel = $derived.by(() => {
		if (!edgeTimeline) return 'Selected connection';
		const from = store.document.navigationNodes.find((node) => node.id === edgeTimeline.fromNodeId);
		const to = store.document.navigationNodes.find((node) => node.id === edgeTimeline.toNodeId);
		return `${from?.label ?? edgeTimeline.fromNodeId} → ${to?.label ?? edgeTimeline.toNodeId}`;
	});
	const timeTicks = $derived.by(() => {
		if (!timeline) return [];
		return timeTicksForDuration(timeline.durationSeconds);
	});
	const shotSegments = $derived.by((): TimelineShotSegment[] => {
		if (!timeline) return [];
		const boundaries = timeline.nodeBoundaries.filter((boundary, index, all) =>
			!(index === all.length - 1 && index > 0 && boundary.nodeId === all[0]?.nodeId)
		);
		return boundaries.map((boundary, index) => {
			const previous = boundaries[index - 1];
			const next = boundaries[index + 1];
			const node = store.document.navigationNodes.find((candidate) => candidate.id === boundary.nodeId);
			return {
				nodeId: boundary.nodeId,
				boundaryIndex: boundary.boundaryIndex,
				label: node?.label ?? boundary.nodeId,
				start: previous ? (previous.progress + boundary.progress) / 2 : 0,
				end: next ? (boundary.progress + next.progress) / 2 : 1,
				holdSeconds: node?.holdSeconds ?? 0
			};
		});
	});

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
		if (event.button !== 0 || framingDisabled || envelopeHandleDrag) return;
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
		if (framingDisabled) return;
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

	function timeTicksForDuration(durationSeconds: number) {
		if (durationSeconds <= 0) return [{ progress: 0, seconds: 0 }];
		const targetIntervals = 5;
		const stepSeconds = Math.max(
			0.25,
			Math.ceil(durationSeconds / targetIntervals / 0.25) * 0.25
		);
		const tickSeconds = Array.from(
			{ length: Math.floor(durationSeconds / stepSeconds) + 1 },
			(_, index) => index * stepSeconds
		);
		if (durationSeconds - tickSeconds.at(-1)! > 1e-9) tickSeconds.push(durationSeconds);
		return tickSeconds.map((seconds) => ({ progress: seconds / durationSeconds, seconds }));
	}

	function percent(progress: number) {
		return `${Math.min(100, Math.max(0, progress * 100))}%`;
	}

	function markerPosition(progress: number) {
		if (progress <= 0) return '12px';
		if (progress >= 1) return 'calc(100% - 12px)';
		return percent(progress);
	}

	// ── P3.5 — Timeline context-menu adapter ─────────────────────────────
	// Markers resolve to their BACKING identities (connection edge / view-key
	// entry / navigation node) and expose only the existing node/key/edge
	// commands. The cosmetic five-lane labels are not menu surfaces.

	function blockedReason(): string | null {
		// P11.2 §3 — AP/DEL predicate: the timeline context menu stays reachable
		// under a playing Director preview (timing/delete auto-pause through the
		// seam); only a visitor or active gesture shows the reason.
		return store.isAuthoringPauseBlocked ? 'Preview is active' : null;
	}

	function onEdgeContextMenu(event: MouseEvent, edge: EditorCameraTimelineEdge): void {
		if (!contextMenu || isEditableTarget(event.target)) return;
		store.selectCameraTimelineEdge(edge.connectionId, edge.direction, 0);
		const failure = validateConnectionDeletion(store.document, edge.connectionId);
		event.preventDefault();
		contextMenu.open({
			surfaceId: 'camera-timeline',
			x: event.clientX,
			y: event.clientY,
			items: buildCameraConnectionContextMenuItems({
				mutationBlockedReason: blockedReason(),
				deleteReason: failure.ok ? null : failure.message,
				actions: {
					openTiming: () =>
						store.selectCameraTimelineEdge(edge.connectionId, 'forward', 0),
					toggleReverse: () => store.toggleCameraEdgeReverse(),
					deleteConnection: () => store.deleteConnection(edge.connectionId)
				}
			})
		});
	}

	function onKeyContextMenu(event: MouseEvent, marker: TimelineViewKeyMarker): void {
		if (!contextMenu || isEditableTarget(event.target)) return;
		store.selectCameraTimelineViewKeyframe(
			marker.connectionId,
			marker.direction,
			marker.keyframeId
		);
		event.preventDefault();
		contextMenu.open({
			surfaceId: 'camera-timeline',
			x: event.clientX,
			y: event.clientY,
			items: buildViewKeyframeContextMenuItems({
				mutationBlockedReason: blockedReason(),
				actions: { deleteKeyframe: () => store.deleteSelectedViewKeyframe() }
			})
		});
	}

	function onNodeMarkerContextMenu(event: MouseEvent, nodeId: string): void {
		if (!contextMenu || isEditableTarget(event.target)) return;
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		if (!node) return;
		store.selectionActions.selectNavigationNode(nodeId);
		const flow = store.mainFlowNodeIds;
		const onSequence = flow.includes(nodeId) || (!store.isRelic && isFlowNode(node));
		const removalFailure = onSequence ? validateGuidedTourRemoval(store.document, nodeId) : null;
		const deletionFailure = validateNavigationNodeDeletion(store.document, nodeId);
		event.preventDefault();
		contextMenu.open({
			surfaceId: 'camera-timeline',
			x: event.clientX,
			y: event.clientY,
			items: buildCameraNodeContextMenuItems({
				spatial: false,
				nodeOnSequence: onSequence,
				mutationBlockedReason: blockedReason(),
				previewCameraReason: !store.isRelic && onSequence
					? 'Sequenced cameras are inspected from Sequence scope'
					: null,
				removeFromSequenceReason:
					removalFailure && !removalFailure.ok ? removalFailure.message : null,
				deleteNodeReason: deletionFailure.ok ? null : deletionFailure.message,
				actions: {
					previewCamera: () => void store.previewSelectedNode(),
					addToSequence: () => store.insertNodeIntoGuidedTour(nodeId, Math.max(flow.length, 0)),
					removeFromSequence: () => store.removeNodeFromGuidedTour(nodeId),
					rename: () => {
						const next = window.prompt('Camera name', node.label)?.trim();
						if (next && next !== node.label) store.commitSelectedNodeLabel(next);
					},
					deleteNode: () => store.deleteNavigationNode(nodeId)
				}
			})
		});
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
		if (event.button !== 0 || framingDisabled || keyDrag) return;
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

{#if edgeTimeline}
	<!-- P12.3 — one-shell Edge projection. Every position is Edge-local;
	     Sequence boundaries, global spans, and authoring handlers stay out. -->
	<div
		class="lanes edge-lanes"
		role="group"
		aria-label="Edge camera timeline lanes"
		onpointerdown={(event) => beginTimelineScrub(event, true)}
		onpointermove={updateTimelineScrub}
		onpointerup={endTimelineScrub}
		onpointercancel={endTimelineScrub}
		onlostpointercapture={cancelTimelineScrub}
	>
		<div class="ruler-label">Time</div>
		<div
			bind:this={scrubTrackElement}
			class="time-ruler scrub-surface"
		>
			{#each edgeTimeTicks as tick (tick.progress)}
				<span class="time-tick" style={`left: ${percent(tick.progress)};`}>
					<i></i>{formatTime(tick.seconds)}
				</span>
			{/each}
		</div>
		<div class="timeline-playhead-overlay" style={`--playhead-progress: ${percent(edgePlayhead)};`}>
			<div class="timeline-playhead-line" aria-hidden="true"></div>
			<div
				class="playhead-head"
				role="slider"
				tabindex="0"
				aria-label="Edge timeline playhead"
				aria-valuemin="0"
				aria-valuemax="1"
				aria-valuenow={edgePlayhead}
				aria-valuetext={`${formatTime(edgeTimeline.durationSeconds * edgePlayhead)} of ${formatTime(edgeTimeline.durationSeconds)}`}
				onkeydown={(event) => handlePlayheadKeydown(event, true)}
			></div>
		</div>

		<div class="lane-label">
			<Route size={14} aria-hidden="true" />
			<strong>Camera Path</strong>
			<span>1 transition · {edgeTimeline.durationSeconds.toFixed(2)}s</span>
		</div>
		<div class="track route-track" aria-label={`Camera Path · ${edgeLabel}`}>
			<div class="rail"></div>
			<div
				class="edge edge-local"
				style="left: 0; width: 100%;"
				title={`${edgeLabel} · ${edgeTimeline.durationSeconds.toFixed(2)}s`}
			></div>
		</div>

		<div class="lane-label quiet">
			<Clapperboard size={14} aria-hidden="true" />
			<strong>Shots</strong>
			<span>No independent shot data</span>
		</div>
		<div class="track shots-track" aria-label="Shots — no independent shot data">
			<span class="no-keys">Quiet for Edge scope</span>
		</div>

		<div class="lane-label">
			<Aperture size={14} aria-hidden="true" />
			<strong>FOV</strong>
			<span>{edgeViewKeyMarkers.length} key{edgeViewKeyMarkers.length === 1 ? '' : 's'}</span>
		</div>
		<div class="track fov-track" aria-label="FOV — Edge-local presentation">
			<div class="rail"></div>
			{#if edgeViewKeyMarkers.length === 0}<span class="no-keys">No FOV keys</span>{/if}
			{#each edgeViewKeyMarkers as marker (marker.keyframeId)}
				<span
					class="key-marker fov-key edge-marker"
					style={`left: ${markerPosition(marker.timeProgress)};`}
					title={`${marker.fov.toFixed(1)}° FOV · ${formatTime(marker.timeSeconds)}`}
					aria-hidden="true"
				><i></i><span>{marker.fov.toFixed(0)}°</span></span>
			{/each}
		</div>

		<div class="lane-label">
			<Crosshair size={14} aria-hidden="true" />
			<strong>Look At</strong>
			<span>Edge-local keys</span>
		</div>
		<div class="track look-track" aria-label="Look At — Edge-local presentation">
			<div class="rail"></div>
			{#if edgeViewKeyMarkers.length === 0}<span class="no-keys">No target keys</span>{/if}
			{#each edgeViewKeyMarkers as marker (`look:${marker.keyframeId}`)}
				<span
					class="key-marker look-key edge-marker"
					style={`left: ${markerPosition(marker.timeProgress)};`}
					title={`Look at ${marker.cameraTarget.map((value) => value.toFixed(1)).join(', ')} · ${formatTime(marker.timeSeconds)}`}
					aria-hidden="true"
				><i></i></span>
			{/each}
		</div>

		<div class="lane-label quiet">
			<RotateCw size={14} aria-hidden="true" />
			<strong>Roll</strong>
			<span>0°</span>
		</div>
		<div class="track roll-track" aria-label="Roll — fixed at zero degrees">
			<div class="rail"></div>
			<span class="roll-value start">0°</span>
			<span class="roll-value end">0°</span>
		</div>
	</div>
{:else if timeline}
	<div
		class="lanes"
		role="group"
		aria-label="Sequence camera timeline lanes"
		onpointerdown={(event) => beginTimelineScrub(event, false)}
		onpointermove={updateTimelineScrub}
		onpointerup={endTimelineScrub}
		onpointercancel={endTimelineScrub}
		onlostpointercapture={cancelTimelineScrub}
	>
		<div class="ruler-label">
			<span>Time</span>
			{#if !store.isRelic && viewMode === '3d'}
				<button
					type="button"
					class="add-view-key"
					data-timeline-interactive
					disabled={!timelineApi.canAddViewKeyframeAtPlayhead}
					onclick={() => timelineApi.addViewKeyframeAtPlayhead()}
				>+ View Key</button>
			{/if}
		</div>
		<div
			bind:this={scrubTrackElement}
			class="time-ruler scrub-surface"
		>
			{#each timeTicks as tick (tick.progress)}
				<span class="time-tick" style={`left: ${percent(tick.progress)};`}>
					<i></i>{formatTime(tick.seconds)}
				</span>
			{/each}
		</div>
		{#if !store.isRelic}
			<div class="timeline-playhead-overlay" style={`--playhead-progress: ${percent(playhead)};`}>
				<div class="timeline-playhead-line" aria-hidden="true"></div>
				<div
					class="playhead-head"
					role="slider"
					tabindex="0"
					aria-label="Sequence timeline playhead"
					aria-valuemin="0"
					aria-valuemax="1"
					aria-valuenow={playhead}
					aria-valuetext={`${formatTime(timeline.durationSeconds * playhead)} of ${formatTime(timeline.durationSeconds)}`}
					onkeydown={(event) => handlePlayheadKeydown(event, false)}
				></div>
			</div>
		{/if}

		<div class="lane-label">
			<Route size={14} aria-hidden="true" />
			<strong>Camera Path</strong>
			<span>{timeline.edges.length} transition{timeline.edges.length === 1 ? '' : 's'}</span>
		</div>
		<div class="track route-track" aria-label="Camera Path">
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
					disabled={selectionDisabled}
					onclick={(event) => selectEdge(event, edge)}
					oncontextmenu={(event) => onEdgeContextMenu(event, edge)}
				>
					<span></span>
				</button>
			{/each}
			{#each timeline.nodeBoundaries as boundary (`${boundary.boundaryIndex}:${boundary.nodeId}`)}
				{@const node = store.document.navigationNodes.find((candidate) => candidate.id === boundary.nodeId)}
				<button
					type="button"
					class="diamond node"
					class:selected={isNodeSelected(boundary.nodeId)}
					style={`left: ${markerPosition(boundary.progress)};`}
					title={`${node?.label ?? boundary.nodeId} · ${formatTime(boundary.timeSeconds)}`}
					aria-label={`Select camera node ${node?.label ?? boundary.nodeId}`}
					disabled={selectionDisabled}
					onclick={(event) => {
						event.stopPropagation();
						store.selectCameraTimelineNode(boundary.nodeId, boundary.boundaryIndex);
					}}
					oncontextmenu={(event) => onNodeMarkerContextMenu(event, boundary.nodeId)}
				>{boundary.boundaryIndex + 1}</button>
			{/each}
			{#if store.isRelic}<div class="playhead" style={`left: ${percent(playhead)};`}></div>{/if}
		</div>

		<div class="lane-label">
			<Clapperboard size={14} aria-hidden="true" />
			<strong>Shots</strong>
			<span>{shotSegments.length} camera{shotSegments.length === 1 ? '' : 's'}</span>
		</div>
		<div class="track shots-track" aria-label="Shots">
			{#each shotSegments as shot (shot.nodeId)}
				<button
					type="button"
					class="shot-block"
					class:selected={isNodeSelected(shot.nodeId)}
					style={`left: ${percent(shot.start)}; width: ${percent(shot.end - shot.start)};`}
					title={`${shot.label}${shot.holdSeconds > 0 ? ` · ${shot.holdSeconds.toFixed(1)}s hold` : ''}`}
					disabled={selectionDisabled}
					onclick={() => store.selectCameraTimelineNode(shot.nodeId, shot.boundaryIndex)}
					oncontextmenu={(event) => onNodeMarkerContextMenu(event, shot.nodeId)}
				><span>{shot.boundaryIndex + 1}</span>{shot.label}</button>
			{/each}
			{#if store.isRelic}<div class="playhead" style={`left: ${percent(playhead)};`}></div>{/if}
		</div>

		<div class="lane-label">
			<Aperture size={14} aria-hidden="true" />
			<strong>FOV</strong>
			<span>{viewKeyMarkers.length} key{viewKeyMarkers.length === 1 ? '' : 's'}</span>
		</div>
		<div bind:this={framingTrackElement} class="track fov-track" aria-label="FOV">
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
						disabled={framingDisabled && !isEnvelopeHandleDragging(handle)}
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

			{#if viewKeyMarkers.length === 0}<span class="no-keys">No FOV keys</span>{/if}
			{#each viewKeyMarkers as marker (`${marker.connectionId}:${marker.direction}:${marker.keyframeId}`)}
				<button
					type="button"
					class="key-marker fov-key"
					class:selected={isKeySelected(marker)}
					class:reverse={marker.direction === 'reverse'}
					class:dragging={isKeyDragging(marker)}
					style={`left: ${markerPosition(marker.progress)};`}
					title={`${marker.fov.toFixed(1)}° FOV · ${marker.direction}`}
					aria-label={`Select FOV key ${marker.keyframeId}`}
					disabled={selectionDisabled && !isKeyDragging(marker)}
					aria-grabbed={isKeyDragging(marker)}
					onpointerdown={(event) => beginKeyDrag(event, marker)}
					onpointermove={updateKeyDrag}
					onpointerup={commitKeyDrag}
					onpointercancel={cancelKeyDragPointer}
					onlostpointercapture={cancelKeyDragPointer}
					oncontextmenu={(event) => onKeyContextMenu(event, marker)}
					onclick={(event) => {
						event.stopPropagation();
						store.selectCameraTimelineViewKeyframe(
							marker.connectionId,
							marker.direction,
							marker.keyframeId
						);
					}}
				><i></i><span>{marker.fov.toFixed(0)}°</span></button>
			{/each}
			{#if store.isRelic}<div class="playhead" style={`left: ${percent(playhead)};`}></div>{/if}
		</div>

		<div class="lane-label">
			<Crosshair size={14} aria-hidden="true" />
			<strong>Look At</strong>
			<span title={activeTrackLabel}>{activeTrackLabel}</span>
		</div>
		<div class="track look-track" aria-label="Look At">
			<div class="rail"></div>
			{#if viewKeyMarkers.length === 0}<span class="no-keys">No target keys</span>{/if}
			{#each viewKeyMarkers as marker (`look:${marker.connectionId}:${marker.direction}:${marker.keyframeId}`)}
				<button
					type="button"
					class="key-marker look-key"
					class:selected={isKeySelected(marker)}
					class:dragging={isKeyDragging(marker)}
					style={`left: ${markerPosition(marker.progress)};`}
					title={`Look at ${marker.cameraTarget.map((value) => value.toFixed(1)).join(', ')} · ${marker.direction}`}
					aria-label={`Select Look At key ${marker.keyframeId}`}
					disabled={selectionDisabled && !isKeyDragging(marker)}
					aria-grabbed={isKeyDragging(marker)}
					onpointerdown={(event) => beginKeyDrag(event, marker)}
					onpointermove={updateKeyDrag}
					onpointerup={commitKeyDrag}
					onpointercancel={cancelKeyDragPointer}
					onlostpointercapture={cancelKeyDragPointer}
					oncontextmenu={(event) => onKeyContextMenu(event, marker)}
					onclick={(event) => {
						event.stopPropagation();
						store.selectCameraTimelineViewKeyframe(marker.connectionId, marker.direction, marker.keyframeId);
					}}
				><i></i></button>
			{/each}
			{#if store.isRelic}<div class="playhead" style={`left: ${percent(playhead)};`}></div>{/if}
		</div>

		<div class="lane-label quiet">
			<RotateCw size={14} aria-hidden="true" />
			<strong>Roll</strong>
			<span>0°</span>
		</div>
		<div class="track roll-track" aria-label="Roll — fixed at zero degrees">
			<div class="rail"></div>
			<span class="roll-value start">0°</span>
			<span class="roll-value end">0°</span>
			{#if store.isRelic}<div class="playhead" style={`left: ${percent(playhead)};`}></div>{/if}
		</div>
	</div>
{/if}

<style>
	.lanes {
		position: relative;
		display: grid;
		min-width: 42rem;
		grid-template-columns: 7.5rem minmax(30rem, 1fr);
		grid-template-rows: 24px 38px 40px 30px 30px 28px;
		overflow-x: auto;
		border: 1px solid var(--editor-border-subtle);
		border-radius: 0.28rem;
		background: var(--editor-timeline-chrome-bg);
	}
	.ruler-label,
	.lane-label {
		box-sizing: border-box;
		border-right: 1px solid var(--editor-border-normal);
		border-top: 1px solid var(--editor-border-subtle);
		background: color-mix(in srgb, var(--editor-bg-panel-raised) 68%, transparent);
	}
	.ruler-label { display: flex; align-items: center; justify-content: space-between; gap: 0.35rem; padding: 0 0.45rem 0 0.65rem; border-top: 0; color: var(--editor-text-tint); font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.08em; }
	.add-view-key { min-height: 20px; padding: 0.15rem 0.35rem; border: 1px solid var(--editor-accent-pressed); border-radius: 0.25rem; background: var(--editor-bg-control); color: var(--editor-text-primary); font: 600 0.54rem/1 var(--editor-font); text-transform: none; letter-spacing: normal; cursor: pointer; }
	.add-view-key:hover:not(:disabled), .add-view-key:focus-visible { border-color: var(--editor-accent); outline: none; }
	.add-view-key:disabled { opacity: 0.38; cursor: default; }
	.lane-label { display: grid; min-width: 0; grid-template-columns: 1.1rem auto minmax(0, 1fr); align-items: center; gap: 0.35rem; padding: 0 0.55rem; }
	.lane-label :global(svg) { color: var(--editor-text-muted); }
	.lane-label strong { color: var(--editor-text-primary); font-size: 0.66rem; font-weight: 620; white-space: nowrap; }
	.lane-label span { overflow: hidden; color: var(--editor-text-muted); font-size: 0.54rem; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
	.lane-label.quiet { opacity: 0.72; }
	.time-ruler { position: relative; min-width: 30rem; container-type: inline-size; border-bottom: 1px solid var(--editor-border-subtle); color: var(--editor-text-timecode); }
	.scrub-surface { cursor: ew-resize; }
	.time-tick { position: absolute; top: 5px; transform: translateX(-50%); font: var(--editor-timeline-ruler-font); font-variant-numeric: tabular-nums; white-space: nowrap; }
	.time-tick:first-child { transform: none; }
	.time-tick:last-child { transform: translateX(-100%); }
	.time-tick i { position: absolute; top: 14px; left: 50%; width: 1px; height: 6px; background: var(--editor-border-strong); }
	.track {
		position: relative;
		min-width: 30rem;
		border-top: 1px solid var(--editor-border-subtle);
		background-image: repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgb(255 255 255 / 4%) calc(10% - 1px), rgb(255 255 255 / 4%) 10%);
		cursor: ew-resize;
	}
	.rail { position: absolute; top: 50%; left: 0.9rem; right: 0.9rem; height: 1px; background: var(--editor-border-strong); }
	.route-track .rail { height: 2px; background: var(--editor-timeline-path); }
	.edge { position: absolute; top: 50%; z-index: 1; height: 6px; min-width: 1px; transform: translateY(-50%); overflow: hidden; padding: 0; border: 0; border-radius: 999px; background: var(--editor-timeline-path); cursor: crosshair; opacity: 0.72; }
	.edge-local { pointer-events: none; cursor: default; }
	.edge:hover:not(:disabled), .edge.selected { opacity: 1; box-shadow: 0 0 0 3px color-mix(in srgb, var(--editor-accent) 18%, transparent); }
	.diamond.node { position: absolute; top: 50%; z-index: 4; width: 20px; height: 20px; transform: translate(-50%, -50%); padding: 0; border: 2px solid var(--editor-timeline-path); border-radius: 50%; background: var(--editor-bg-panel); color: var(--editor-text-primary); font: 650 0.58rem/1 var(--editor-font); cursor: pointer; }
	.diamond.node:hover:not(:disabled), .diamond.node.selected { border-color: var(--editor-accent-hover); background: var(--editor-bg-selected); box-shadow: 0 0 0 3px color-mix(in srgb, var(--editor-accent) 16%, transparent); }
	.shot-block { position: absolute; top: 5px; bottom: 5px; display: flex; min-width: 1px; align-items: center; gap: 0.35rem; overflow: hidden; padding: 0 0.45rem; border: 1px solid color-mix(in srgb, var(--editor-timeline-look) 38%, transparent); border-radius: 2px; background: linear-gradient(90deg, color-mix(in srgb, var(--editor-timeline-path) 26%, transparent), color-mix(in srgb, var(--editor-timeline-look) 18%, transparent)); color: var(--editor-text-secondary); font: 0.58rem/1 var(--editor-font); text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
	.shot-block span { display: inline-grid; width: 16px; height: 16px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: rgb(255 255 255 / 10%); color: var(--editor-text-primary); }
	.shot-block:hover:not(:disabled) { border-color: var(--editor-accent-hover); color: var(--editor-text-primary); }
	.shot-block.selected { border-color: var(--editor-accent); background: linear-gradient(90deg, color-mix(in srgb, var(--editor-accent) 45%, transparent), color-mix(in srgb, var(--editor-timeline-look) 30%, transparent)); color: var(--editor-text-primary); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--editor-accent) 40%, transparent); }
	.key-marker { position: absolute; top: 50%; z-index: 4; display: inline-flex; align-items: center; gap: 0.25rem; transform: translate(-50%, -50%); padding: 0; border: 0; background: transparent; color: var(--editor-text-secondary); font: 0.54rem/1 var(--editor-font); cursor: ew-resize; }
	.key-marker i { display: block; width: 8px; height: 8px; transform: rotate(45deg); border: 1px solid currentColor; background: var(--editor-bg-panel); }
	.fov-key { color: var(--editor-timeline-fov); }
	.look-key { color: var(--editor-timeline-look); }
	.look-key i { border-radius: 50%; transform: none; }
	.key-marker.reverse { filter: saturate(0.72); }
	.key-marker:hover:not(:disabled), .key-marker.selected { color: var(--editor-text-primary); text-shadow: 0 0 8px color-mix(in srgb, var(--editor-accent) 70%, transparent); }
	.key-marker.dragging { color: var(--editor-text-primary); cursor: grabbing; }
	.edge-marker { pointer-events: none; cursor: default; }
	.playhead { position: absolute; top: 0; bottom: 0; z-index: 3; width: 1px; transform: translateX(-0.5px); background: var(--editor-timeline-playhead); pointer-events: none; box-shadow: 0 0 5px color-mix(in srgb, var(--editor-accent) 55%, transparent); }
	.timeline-playhead-overlay { position: absolute; top: 0; right: 0; bottom: 0; left: 7.5rem; z-index: 5; pointer-events: none; }
	.timeline-playhead-line { position: absolute; top: 18px; bottom: 0; left: var(--playhead-progress); width: 1px; transform: translateX(-0.5px); background: var(--editor-timeline-playhead); box-shadow: 0 0 5px color-mix(in srgb, var(--editor-accent) 55%, transparent); }
	.playhead-head { position: absolute; top: 12px; left: var(--playhead-progress); z-index: 6; width: 24px; height: 24px; transform: translateX(-50%); outline: none; cursor: ew-resize; pointer-events: auto; }
	.playhead-head::before { content: ''; position: absolute; top: 3px; left: 5px; border-right: 7px solid transparent; border-left: 7px solid transparent; border-top: 9px solid var(--editor-accent); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--editor-accent) 70%, transparent)); }
	.playhead-head:focus-visible { border-radius: 4px; box-shadow: 0 0 0 1px var(--editor-accent); }
	.no-keys { position: absolute; top: 50%; left: 0.65rem; transform: translateY(-50%); color: var(--editor-text-disabled); font-size: 0.56rem; }
	.roll-track .rail { background: var(--editor-timeline-roll); opacity: 0.5; }
	.roll-value { position: absolute; top: 50%; transform: translateY(-50%); color: var(--editor-text-muted); font-size: 0.54rem; }
	.roll-value.start { left: 0.3rem; }
	.roll-value.end { right: 0.3rem; }

	/* P1.6 — envelope influence bands */
	.envelope-band { position: absolute; top: 0; bottom: 0; pointer-events: none; }
	.envelope-band.auto { background: rgb(74 72 82 / 18%); }
	.envelope-band.blend { background: rgb(217 164 65 / 22%); }
	.envelope-band.authored { background: rgb(217 164 65 / 35%); }
	.envelope-band.active-edge.auto { background: rgb(74 72 82 / 28%); }
	.envelope-band.active-edge.blend { background: rgb(217 164 65 / 30%); }
	.envelope-band.active-edge.authored { background: rgb(217 164 65 / 45%); }

	/* P1.6 — envelope handles */
	.envelope-handle { position: absolute; top: 50%; z-index: 4; width: 0.6rem; height: 1.5rem; transform: translate(-50%, -50%); padding: 0; border: 1px solid var(--editor-accent); border-radius: 2px; background: var(--editor-bg-selected); cursor: ew-resize; }
	.envelope-handle:hover:not(:disabled), .envelope-handle.dragging { border-color: var(--editor-warning); background: var(--editor-text-primary); }
	.envelope-handle:disabled { opacity: 0.35; cursor: default; }

	@media (max-width: 44rem) {
		.lanes { grid-template-columns: 7rem minmax(30rem, 1fr); }
		.timeline-playhead-overlay { left: 7rem; }
	}
	@container (min-width: 52rem) {
	}
</style>
