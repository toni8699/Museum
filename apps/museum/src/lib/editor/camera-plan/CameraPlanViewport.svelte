<script lang="ts">
	// P1.5 — Camera Plan SVG viewport. Owns only the pointer/keyboard
	// lifecycle: pan/zoom, Select hits, Add Camera floor placement, Connect
	// rubber band + commit clicks, node/anchor/direct-path drags with one
	// history entry, and the capture-phase Escape cancel. All document writes
	// route through the existing store commands and selection actions; no
	// layout selection is ever written here.
	import { getContext, onMount } from 'svelte';
	import type { LayoutVec2 } from '$lib/layout/layout-types';
	import type { Vec3 } from '$lib/types/museum';
	import { Vector3 } from 'three';
	import type { MuseumEditorStore } from '../museum-editor.svelte';
	import type { LayoutPreviewState } from '../layout/layout-preview-state.svelte';
	import type { EditorNavigationSelection } from '../editor-selection';
	import {
		createDraftConnectionPositionPath,
		EDITOR_CAMERA_PATH_MOVE_EPSILON,
		getCameraPathInsertionIndex,
		getScenePathAnchorWorldPosition
	} from '../editor-camera-path';
	import { findPlanHitRoom } from '../layout/plan-hit';
	import {
		buildPlanGrid,
		framePlanViewport,
		panPlanViewport,
		planScreenToWorld,
		setPlanViewportSize,
		snapToGrid,
		zoomPlanViewport,
		type PlanGridLine
	} from '../layout/layout-plan-transform';
	import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
	import PlanSvg from '../layout/PlanSvg.svelte';
	import {
		buildCameraPlanTransientPrimitives,
		buildPlanCameraAuthoringProjection,
		type CameraPlanTransientState,
		type PlanCameraSelectionInput
	} from '../layout/plan-camera-projection';
	import { applyCameraPlanHover } from './camera-plan-hover';
	import {
		nearestPolylineProgress,
		resolveCameraPlanHit
	} from './camera-plan-hit';
	import type { CameraPlanState } from './camera-plan-state.svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		type EditorActiveSelectionStore
	} from '../app/active-editor-selection.svelte';

	let {
		store,
		preview,
		cameraPlan
	}: {
		store: MuseumEditorStore;
		preview: LayoutPreviewState;
		cameraPlan: CameraPlanState;
	} = $props();
	const activeSelection = getContext<EditorActiveSelectionStore | undefined>(
		ACTIVE_EDITOR_SELECTION_KEY
	);

	const DRAG_THRESHOLD_PX = 4;

	type CameraPlanDragSession = {
		kind: 'node' | 'anchor';
		pointerId: number;
		startX: number;
		startY: number;
		initialWorld: LayoutVec2;
		initialWorldY: number;
		lastWorld: LayoutVec2;
		nodeId?: string;
		connectionId?: string;
		anchorId?: string;
		dragging: boolean;
		originalSelection: EditorNavigationSelection;
	};

	let svgElement = $state<SVGSVGElement>();
	let panPointerId = $state<number | null>(null);
	let lastPanScreen = $state<LayoutVec2 | null>(null);
	let pointerWorld = $state<LayoutVec2 | null>(null);
	let rubberBand = $state<CameraPlanTransientState['rubberBand']>(null);
	let placementGhost = $state<CameraPlanTransientState['placementGhost']>(null);
	let dragSession = $state<CameraPlanDragSession | null>(null);
	let framedReplacementVersion = $state<number | null>(null);

	const viewBox = $derived(
		`0 0 ${cameraPlan.planView.width} ${cameraPlan.planView.height}`
	);
	const gridLines = $derived<PlanGridLine[]>(buildPlanGrid(cameraPlan.planView));
	const scaleMeters = $derived(100 / cameraPlan.planView.pixelsPerMeter);

	const authoringProjection = $derived.by(() => {
		try {
		return buildPlanCameraAuthoringProjection(store.document, store.rooms, {
			selection: navigationSelectionToInput(store.navigationSelection),
			mainFlowNodeIds: store.mainFlowNodeIds,
			retainedConnectionIds: store.flowRetainedConnectionIds
		});
		} catch (error) {
			// Scene/layout divergence must not break the plan surface.
			console.error('Camera Plan: authoring projection failed', error);
			return undefined;
		}
	});
	const transients = $derived.by<CameraPlanTransientState>(() => ({
		rubberBand,
		placementGhost
	}));
	const planModel = $derived.by(() => {
		const camera = authoringProjection;
		if (!camera?.authoring) return buildPlanRenderModel(preview.geometry);
		return buildPlanRenderModel(preview.geometry, {
			...camera,
			authoring: {
				...camera.authoring,
				interaction: buildCameraPlanTransientPrimitives(transients)
			}
		});
	});
	// P1.5 — hover is presentation-only and applied as a post-model token remap,
	// so pointer moves (per-move `cameraPlan.hover` writes) never re-run the
	// document-driven authoring projection or render-model build.
	const hoveredModel = $derived(
		planModel && authoringProjection?.authoring
			? applyCameraPlanHover(planModel, authoringProjection.authoring, cameraPlan.hover)
			: planModel
	);

	const pendingMessage = $derived.by(() => {
		const pending = store.pendingNavigationCommand;
		if (pending?.kind === 'place-camera') {
			return 'Click any tagged room floor to place a camera · Escape cancels';
		}
		if (pending?.kind === 'connect-existing') {
			return 'Choose another camera node · Escape cancels';
		}
		if (cameraPlan.tool === 'view') {
			return 'Drag to pan · wheel zooms · Select returns to editing';
		}
		return 'Click node or edge to select · drag to move or bend · middle-drag pans · wheel zooms';
	});

	function navigationSelectionToInput(
		selection: EditorNavigationSelection
	): PlanCameraSelectionInput {
		if (!selection) return null;
		if (selection.kind === 'node') {
			return { kind: 'node', nodeId: selection.nodeId };
		}
		if (selection.kind === 'connection') {
			return { kind: 'connection', connectionId: selection.connectionId };
		}
		if (selection.kind === 'anchor') {
			return {
				kind: 'anchor',
				connectionId: selection.connectionId,
				anchorId: selection.anchorId
			};
		}
		// A persisted view-keyframe selection stays selected across the view
		// switch but carries no Camera Plan framing surface.
		return null;
	}

	onMount(() => {
		// P1.5 — hover is session state owned at the app root, so it survives the
		// Camera Plan ↔ 3D swap; clear it on mount (and unmount) so a leftover
		// hover from a previous Plan session can never render after switching
		// back to Plan before the pointer moves.
		cameraPlan.hover = null;
		const svg = svgElement;
		if (!svg) return;
		const resize = () => {
			const rect = svg.getBoundingClientRect();
			setPlanViewportSize(cameraPlan.planView, rect.width, rect.height);
			if (!cameraPlan.planView.initialized) frameView();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(svg);
		resize();
		store.setDirectPathDragCanceler(cancelDrag);
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			observer.disconnect();
			cancelDrag();
			cameraPlan.hover = null;
			store.setDirectPathDragCanceler(null);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});

	$effect(() => {
		const replacementVersion = preview.reframeVersion;
		if (framedReplacementVersion === null) {
			framedReplacementVersion = replacementVersion;
			return;
		}
		if (replacementVersion === framedReplacementVersion) return;
		framedReplacementVersion = replacementVersion;
		frameView();
	});

	function frameView() {
		const points: LayoutVec2[] = [
			...preview.model.rooms.flatMap((room) => room.floorPolygon),
			...preview.model.objects.flatMap((object) => object.planFootprint),
			...store.document.navigationNodes.map((node) => {
				const world = store.rooms.point(node.roomId, node.position);
				return [world[0], world[2]] as LayoutVec2;
			})
		];
		framePlanViewport(cameraPlan.planView, points);
	}

	function screenPoint(event: { clientX: number; clientY: number }): LayoutVec2 | null {
		const svg = svgElement;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		return [event.clientX - rect.left, event.clientY - rect.top];
	}

	function worldPoint(event: { clientX: number; clientY: number }): LayoutVec2 | null {
		const screen = screenPoint(event);
		return screen ? planScreenToWorld(cameraPlan.planView, screen) : null;
	}

	function snapPoint(point: LayoutVec2): LayoutVec2 {
		return cameraPlan.planView.snapEnabled ? snapToGrid(point) : point;
	}

	/** Add-Camera placement candidate: snapped X/Z that still belongs to the hit room. */
	function placementCandidateAt(point: LayoutVec2): {
		point: LayoutVec2;
		roomId: string | null;
	} {
		let candidate = snapPoint(point);
		let room = findPlanHitRoom(preview.model.queries, candidate);
		if (!room) {
			candidate = point;
			room = findPlanHitRoom(preview.model.queries, candidate);
		}
		return { point: candidate, roomId: room?.roomId ?? null };
	}

	function beginPlaceCamera(event: PointerEvent) {
		const world = worldPoint(event);
		if (!world) return;
		const candidate = placementCandidateAt(world);
		if (!candidate.roomId) {
			store.setStatusMessage('Click a tagged museum-room floor');
			return;
		}
		const entry = store.rooms.get(candidate.roomId);
		if (!entry) {
			store.setStatusMessage('Click a tagged museum-room floor');
			return;
		}
		const floorWorld: Vec3 = [
			candidate.point[0],
			entry.floor.elevation,
			candidate.point[1]
		];
		// deterministic initial forward: room-local -Z through the live registry.
		const origin = store.rooms.point(candidate.roomId, [0, 0, 0]);
		const forward = store.rooms.point(candidate.roomId, [0, 0, -1]);
		const cameraForwardWorld: Vec3 = [
			forward[0] - origin[0],
			0,
			forward[2] - origin[2]
		];
		store.createPendingNavigationNodeAt(
			candidate.roomId,
			floorWorld,
			cameraForwardWorld
		);
	}

	function beginDragSession(
		event: PointerEvent,
		session: CameraPlanDragSession
	): boolean {
		if (!svgElement) return false;
		dragSession = session;
		svgElement.setPointerCapture(event.pointerId);
		event.preventDefault();
		event.stopImmediatePropagation();
		return true;
	}

	function startDragging(session: CameraPlanDragSession): boolean {
		if (!store.beginDocumentTransaction()) return false;
		if (session.kind === 'anchor' && !session.anchorId) {
			// Direct-path shaping: resolve nearest progress on the exact shared
			// curve, insert one interior anchor at the matching index, then drag
			// it in X/Z while preserving the sampled curve Y.
			const connectionId = session.connectionId!;
			const connection = authoringProjection?.authoring?.connections.find(
				(candidate) => candidate.connectionId === connectionId
			);
			if (!connection) {
				store.cancelDocumentTransaction();
				return false;
			}
			store.selectionActions.selectConnection(connectionId);
			store.convertConnectionDraft(connectionId);
			const path = createDraftConnectionPositionPath(
				store.document,
				connectionId,
				'forward',
				store.rooms
			);
			const progress = nearestPolylineProgress(
				connection.polyline,
				session.initialWorld
			);
			const sample = new Vector3();
			path.getPointAt(progress, sample);
			const insertionIndex = getCameraPathInsertionIndex(path, progress);
			const anchorId = store.insertConnectionAnchorAtWorldPoint(
				connectionId,
				insertionIndex,
				[sample.x, sample.y, sample.z]
			);
			if (!anchorId) {
				store.cancelDocumentTransaction();
				return false;
			}
			session.anchorId = anchorId;
			session.initialWorld = [sample.x, sample.z];
			session.initialWorldY = sample.y;
		}
		session.dragging = true;
		store.setDirectPathInteractionActive(true);
		return true;
	}

	function dragToWorld(session: CameraPlanDragSession, world: LayoutVec2) {
		if (session.kind === 'node') {
			const node = store.document.navigationNodes.find(
				(candidate) => candidate.id === session.nodeId
			);
			if (!node) return;
			const resolved = store.rooms.point(node.roomId, node.position);
			const next = snapPoint(world);
			const local = store.rooms.localPoint(node.roomId, [
				next[0],
				resolved[1],
				next[1]
			]);
			store.updateNavigationNodePoint(node.id, 'position', local);
			session.lastWorld = next;
			return;
		}
		const next = snapPoint(world);
		store.updateConnectionAnchorWorldPoint(
			session.connectionId!,
			session.anchorId!,
			[next[0], session.initialWorldY, next[1]]
		);
		session.lastWorld = next;
	}

	function restoreSelection(session: CameraPlanDragSession) {
		// P7.1 — guard-free session-restore adapter (drag teardown).
		store.selectionActions.restoreSelectionSnapshot({
			navigation: session.originalSelection,
			placementIds: [],
			clusterId: null
		});
	}

	function cancelDrag(): boolean {
		const session = dragSession;
		if (!session) return false;
		dragSession = null;
		if (session.dragging) {
			store.setDirectPathInteractionActive(false);
			store.cancelDocumentTransaction();
		}
		restoreSelection(session);
		if (svgElement?.hasPointerCapture(session.pointerId)) {
			svgElement.releasePointerCapture(session.pointerId);
		}
		return true;
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button === 1) {
			const screen = screenPoint(event);
			if (!screen || !svgElement) return;
			panPointerId = event.pointerId;
			lastPanScreen = screen;
			svgElement.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}
		if (event.button !== 0) return;
		svgElement?.focus();
		const world = worldPoint(event);
		const screen = screenPoint(event);
		if (!world || !screen) return;

		if (cameraPlan.tool === 'view') {
			if (!svgElement) return;
			panPointerId = event.pointerId;
			lastPanScreen = screen;
			svgElement.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}

		const pending = store.pendingNavigationCommand;
		if (pending?.kind === 'place-camera') {
			beginPlaceCamera(event);
			return;
		}
		if (
			pending?.kind === 'connect-existing' ||
			pending?.kind === 'connect-pending-node'
		) {
			const hit = authoringProjection?.authoring
				? resolveCameraPlanHit(
						authoringProjection.authoring,
						world,
						cameraPlan.planView.pixelsPerMeter
				  )
				: null;
			// Clicking a destination node routes through the existing
			// pending-command branch (validate + commit); backdrop clicks
			// leave Connect armed.
			if (hit?.kind === 'node') {
				store.selectionActions.selectNavigationNode(hit.nodeId);
			}
			return;
		}
		if (cameraPlan.tool !== 'select') return;

		const hit = authoringProjection?.authoring
			? resolveCameraPlanHit(
					authoringProjection.authoring,
					world,
					cameraPlan.planView.pixelsPerMeter
			  )
			: null;
		const blocked =
			store.isDocumentMutationBlocked || store.isEditorInteractionActive;

		if (hit?.kind === 'node') {
			store.selectionActions.selectNavigationNode(hit.nodeId);
			if (blocked) return;
			beginDragSession(event, {
				kind: 'node',
				pointerId: event.pointerId,
				startX: screen[0],
				startY: screen[1],
				initialWorld: world,
				initialWorldY: 0,
				lastWorld: world,
				nodeId: hit.nodeId,
				dragging: false,
				originalSelection: store.navigationSelection
			});
			return;
		}
		if (hit?.kind === 'anchor') {
			store.selectionActions.selectAnchor(
				hit.connectionId,
				hit.anchorId
			);
			if (blocked) return;
			const anchor = store.document.connections
				.find((connection) => connection.id === hit.connectionId)
				?.positionPath.anchors.find(
					(candidate) => candidate.id === hit.anchorId
				);
			const anchorWorld = anchor
				? getScenePathAnchorWorldPosition(anchor, store.rooms)
				: null;
			if (!anchorWorld) return;
			beginDragSession(event, {
				kind: 'anchor',
				pointerId: event.pointerId,
				startX: screen[0],
				startY: screen[1],
				initialWorld: [anchorWorld[0], anchorWorld[2]],
				initialWorldY: anchorWorld[1],
				lastWorld: [anchorWorld[0], anchorWorld[2]],
				connectionId: hit.connectionId,
				anchorId: hit.anchorId,
				dragging: false,
				originalSelection: store.navigationSelection
			});
			return;
		}
		if (hit?.kind === 'edge') {
			store.selectionActions.selectConnection(hit.connectionId);
			if (blocked) return;
			const connection = authoringProjection?.authoring?.connections.find(
				(candidate) => candidate.connectionId === hit.connectionId
			);
			if (!connection) return;
			const path = createDraftConnectionPositionPath(
				store.document,
				hit.connectionId,
				'forward',
				store.rooms
			);
			const progress = nearestPolylineProgress(connection.polyline, world);
			const sample = new Vector3();
			path.getPointAt(progress, sample);
			beginDragSession(event, {
				kind: 'anchor',
				pointerId: event.pointerId,
				startX: screen[0],
				startY: screen[1],
				initialWorld: [sample.x, sample.z],
				initialWorldY: sample.y,
				lastWorld: [sample.x, sample.z],
				connectionId: hit.connectionId,
				anchorId: undefined,
				dragging: false,
				originalSelection: store.navigationSelection
			});
			return;
		}
		// empty backdrop: clear whichever domain is active — never a layout pick.
		if (activeSelection) activeSelection.deselectActive();
	}

	function onPointerMove(event: PointerEvent) {
		const screen = screenPoint(event);
		const world = worldPoint(event);
		pointerWorld = world ?? null;

		if (panPointerId === event.pointerId && lastPanScreen && screen) {
			panPlanViewport(cameraPlan.planView, [
				screen[0] - lastPanScreen[0],
				screen[1] - lastPanScreen[1]
			]);
			lastPanScreen = screen;
			return;
		}

		const pending = store.pendingNavigationCommand;
		if (pending?.kind === 'place-camera' && world) {
			const candidate = placementCandidateAt(world);
			placementGhost = { point: candidate.point, valid: candidate.roomId !== null };
			rubberBand = null;
			cameraPlan.hover = null;
			return;
		}
		if (pending?.kind === 'connect-existing' && world) {
			const source = store.document.navigationNodes.find(
				(node) => node.id === pending.sourceNodeId
			);
			if (source) {
				const sourceWorld = store.rooms.point(source.roomId, source.position);
				rubberBand = {
					from: [sourceWorld[0], sourceWorld[2]],
					to: world
				};
			}
			placementGhost = null;
			cameraPlan.hover = world && authoringProjection?.authoring
				? resolveCameraPlanHit(
						authoringProjection.authoring,
						world,
						cameraPlan.planView.pixelsPerMeter
				  )
				: null;
			return;
		}
		if (pending) {
			placementGhost = null;
			rubberBand = null;
			return;
		}
		placementGhost = null;
		rubberBand = null;

		const session = dragSession;
		if (session && session.pointerId === event.pointerId) {
			if (!screen) return;
			if (!session.dragging) {
				const moved = Math.hypot(
					screen[0] - session.startX,
					screen[1] - session.startY
				);
				if (moved > DRAG_THRESHOLD_PX) {
					if (!startDragging(session)) return;
				}
			}
			if (session.dragging && world) dragToWorld(session, world);
			return;
		}
		if (cameraPlan.tool === 'select' && world && authoringProjection?.authoring) {
			cameraPlan.hover = resolveCameraPlanHit(
				authoringProjection.authoring,
				world,
				cameraPlan.planView.pixelsPerMeter
			);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (panPointerId === event.pointerId) {
			panPointerId = null;
			lastPanScreen = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		const session = dragSession;
		if (!session || session.pointerId !== event.pointerId) return;
		dragSession = null;
		if (session.dragging) {
			const moved =
				Math.hypot(
					session.lastWorld[0] - session.initialWorld[0],
					session.lastWorld[1] - session.initialWorld[1]
				) > EDITOR_CAMERA_PATH_MOVE_EPSILON;
			store.setDirectPathInteractionActive(false);
			if (moved) {
				if (!store.commitDocumentTransaction()) restoreSelection(session);
			} else {
				store.cancelDocumentTransaction();
				restoreSelection(session);
			}
		}
		if (svgElement?.hasPointerCapture(event.pointerId)) {
			svgElement.releasePointerCapture(event.pointerId);
		}
	}

	function onPointerCancel(event: PointerEvent) {
		if (panPointerId === event.pointerId) {
			panPointerId = null;
			lastPanScreen = null;
		}
		if (dragSession?.pointerId === event.pointerId) cancelDrag();
		if (svgElement?.hasPointerCapture(event.pointerId)) {
			svgElement.releasePointerCapture(event.pointerId);
		}
	}

	function onLostPointerCapture(event: PointerEvent) {
		if (dragSession?.pointerId === event.pointerId) cancelDrag();
	}

	/** Capture-phase Escape: an in-flight Camera Plan drag cancels first and
	 * must not fall through to the window shortcut cascade (pending-command
	 * cancellation or camera deselection). */
	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !cancelDrag()) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function onWheel(event: WheelEvent) {
		const screen = screenPoint(event);
		if (!screen) return;
		event.preventDefault();
		zoomPlanViewport(
			cameraPlan.planView,
			event.deltaY < 0 ? 1.12 : 1 / 1.12,
			screen
		);
	}

	function onPointerLeave() {
		pointerWorld = null;
		placementGhost = null;
		rubberBand = null;
		cameraPlan.hover = null;
	}
</script>

<div class="camera-plan-viewport" aria-label="Camera Plan drafting viewport">
	<div class="plan-help" role="status">{pendingMessage}</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (plan surface owns keyboard focus) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (plan surface owns pointer drafting events) -->
	<svg
		bind:this={svgElement}
		class="plan-canvas"
		viewBox={viewBox}
		preserveAspectRatio="none"
		role="application"
		tabindex="0"
		aria-label="2D camera graph plan"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onlostpointercapture={onLostPointerCapture}
		onwheel={onWheel}
		onpointerleave={onPointerLeave}
	>
		{#if cameraPlan.planView.gridEnabled}
			{#each gridLines as line (line.id)}
				<line class:major={line.major} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} />
			{/each}
			{#each gridLines.filter((line) => line.major) as line (`label-${line.id}`)}
				<text class="grid-label" x={line.start[0] + 4} y={line.start[1] + 12}>{line.value.toFixed(0)} m</text>
			{/each}
		{/if}
		{#if hoveredModel}
			<PlanSvg model={hoveredModel} planView={cameraPlan.planView} />
		{/if}
		<text class="scale-label" x="16" y={cameraPlan.planView.height - 18}>{scaleMeters.toFixed(2)} m / 100 px</text>
		<line class="scale-bar" x1="16" y1={cameraPlan.planView.height - 10} x2="116" y2={cameraPlan.planView.height - 10} />
	</svg>
	<div class="plan-meta">
		<span>{store.document.navigationNodes.length} cameras</span>
		<span>{store.document.connections.length} connections</span>
	</div>
</div>

<style>
	.camera-plan-viewport { position: absolute; inset: 0; z-index: 3; background: #0d0d12; }
	.plan-canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; outline: none; }
	.plan-canvas line { stroke: #302d38; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.plan-canvas line.major { stroke: #494352; }
	.grid-label { fill: #746d7d; font: 10px ui-monospace, monospace; pointer-events: none; }
	.scale-label { fill: #d6d0c4; font: 11px ui-monospace, monospace; }
	.scale-bar { stroke: #fff2c7; stroke-width: 3; vector-effect: non-scaling-stroke; }
	.plan-help { position: absolute; top: 4.25rem; left: 50%; z-index: 5; max-width: min(34rem, calc(100% - 2rem)); transform: translateX(-50%); padding: 0.45rem 0.7rem; border: 1px solid #49433a; border-radius: 999px; background: rgb(18 18 24 / 92%); color: #fff2c7; font: 600 0.7rem/1.2 ui-sans-serif, system-ui, sans-serif; pointer-events: none; text-align: center; }
	.plan-meta { position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.7rem; color: #a8a29a; font: 0.68rem/1 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
	@media (max-width: 44rem) {
		.plan-help { top: 5.5rem; }
	}
</style>
