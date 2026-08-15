<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import {
		addPolygonPoint,
		beginLayoutObjectDrag,
		beginLayoutRoomUnitDrag,
		beginLayoutPrimitiveDraft,
		beginRectangle,
		beginRoomEdit,
		cancelLayoutObjectDrag,
		cancelLayoutRoomUnitDrag,
		cancelLayoutPrimitiveDraft,
		cancelRoomEdit,
		clearLayoutDraft,
		clearLayoutSelection,
		selectLayoutInteriorAnchor,
		selectLayoutObject,
		selectLayoutOpening,
		selectLayoutRoom,
		selectLayoutWall,
		setLayoutDraftTool,
		removeLastPolygonPoint,
		shouldBeginWallBend,
		updateRectangle,
		updateLayoutObjectDrag,
		updateLayoutRoomUnitDrag,
		updateLayoutPrimitiveDraft,
		updateRoomEdit,
		primitiveDraftCenter,
		rectanglePoints,
		type LayoutInteractionState
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutPrimitive,
		commitLayoutRoomEdit,
		previewLayoutRoomUnit,
		deleteLayoutObject,
		deleteLayoutWallInteriorAnchor,
		insertLayoutWallInteriorAnchor,
		restoreLayoutPreviewSnapshot,
		updateLayoutObjectFields,
		updateLayoutWallInteriorAnchor,
		updateLayoutOpeningFields,
		type LayoutPreviewSnapshot
	} from './layout-preview-state.svelte';
	import {
		snapSegmentOffset,
		LAYOUT_PLAN_HIT_RADIUS_PX,
		type LayoutOpeningKind
	} from './layout-opening-editing';
	import { compiledWallLength, findPlanHitRoom, projectPointToWall, resolvePlanHit } from './plan-hit';
	import {
		buildPlanGrid,
		constrainToAngle,
		framePlanViewport,
		panPlanViewport,
		planScreenToWorld,
		setPlanViewportSize,
		snapToGrid,
		zoomPlanViewport,
		type PlanGridLine
	} from './layout-plan-transform';
	import type { LayoutRoom, LayoutVec2 } from './layout-types';
	import { layoutRoomUnitPivot } from './layout-room-transform';
	import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
	import { buildPlanInteractionProjection, rotationHandleScreenPoint } from './plan-overlays';
	import { planCameraProjectionForProject } from './plan-camera-projection';
	import PlanSvg from './PlanSvg.svelte';

	let {
		model,
		preview,
		interaction,
		onCommit,
		onOpeningCreate,
		onOpeningDelete,
		onRoomDelete,
		onLayoutTransactionBegin,
		onLayoutTransactionCommit,
		onLayoutTransactionCancel
	}: {
		model: LayoutPreviewModel;
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
		onCommit: (points: LayoutVec2[]) => boolean;
		onOpeningCreate: (roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) => void;
		onOpeningDelete: (roomId: string, openingId: string) => void;
		onRoomDelete: (roomId: string) => boolean;
		onLayoutTransactionBegin: () => boolean;
		onLayoutTransactionCommit: () => boolean;
		onLayoutTransactionCancel: () => boolean;
	} = $props();

	let svgElement = $state<SVGSVGElement>();
	let pointerId = $state<number | null>(null);
	let panPointerId = $state<number | null>(null);
	let lastPanScreen = $state<LayoutVec2 | null>(null);
	let interiorAnchorPointerId = $state<number | null>(null);
	let draggedInteriorAnchor = $state<{ roomId: string; segmentId: string; anchorId: string } | null>(null);
	let pendingWallBend = $state<{
		pointerId: number;
		roomId: string;
		segmentId: string;
		projectionPoint: LayoutVec2;
		originScreen: LayoutVec2;
	} | null>(null);
	let openingDrag = $state<{ roomId: string; segmentId: string; openingId: string; width: number } | null>(null);
	let dragSnapshot = $state<LayoutPreviewSnapshot | null>(null);
	let suppressNextClick = $state(false);
	let framedReplacementVersion = $state<number | null>(null);
	let roomUnitSnapshot = $state<LayoutPreviewSnapshot | null>(null);
	let rotationHoverScreen = $state<LayoutVec2 | null>(null);

	const viewBox = $derived(`0 0 ${interaction.planView.width} ${interaction.planView.height}`);
	const gridLines = $derived<PlanGridLine[]>(buildPlanGrid(interaction.planView));
	const draftPolygon = $derived(
		interaction.tool === 'rectangle'
			? rectanglePoints(interaction)
			: interaction.polygonPoints
	);
	const scaleMeters = $derived(100 / interaction.planView.pixelsPerMeter);
	const rooms = $derived(preview.project.layout.floors.flatMap((floor) => floor.rooms));
	const interactionProjection = $derived(buildPlanInteractionProjection(interaction, rooms, model));
	const cameraProjection = $derived.by(() => {
		if (!interaction.planView.showTourOverlay) return undefined;
		try {
			return planCameraProjectionForProject(preview.project, preview.geometry, preview.issues);
		} catch {
			// Scene/layout divergence (e.g. imported layout missing scene rooms) must not break the plan.
			return undefined;
		}
	});
	const planModel = $derived(
		buildPlanRenderModel(preview.geometry, cameraProjection, interactionProjection)
	);
	const selectedOpeningSelection = $derived(
		interaction.selection.kind === 'opening' ? interaction.selection : null
	);
	const selectedOpening = $derived.by(() => {
		if (!selectedOpeningSelection) return undefined;
		return findLayoutRoom(rooms, selectedOpeningSelection.roomId)?.openings.find(
			(opening) => opening.id === selectedOpeningSelection.openingId
		);
	});
	const rotationHandleHovered = $derived.by(() => {
		if (interaction.tool !== 'select' || !rotationHoverScreen) return false;
		const handle = rotationHandleScreenPoint(interaction.planView, interactionProjection);
		return handle ? distance(handle, rotationHoverScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX : false;
	});

	onMount(() => {
		const svg = svgElement;
		if (!svg) return;
		const resize = () => {
			const rect = svg.getBoundingClientRect();
			setPlanViewportSize(interaction.planView, rect.width, rect.height);
			if (!interaction.planView.initialized) frameView();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(svg);
		resize();
		return () => observer.disconnect();
	});

	$effect(() => {
		const replacementVersion = preview.reframeVersion;
		if (framedReplacementVersion === null) {
			framedReplacementVersion = replacementVersion;
			return;
		}
		if (interaction.viewMode !== 'plan' || replacementVersion === framedReplacementVersion) return;
		framedReplacementVersion = replacementVersion;
		frameView();
	});

	function frameView() {
		const points = [
			...model.rooms.flatMap((room) => room.floorPolygon),
			...model.objects.flatMap((object) => object.planFootprint)
		];
		framePlanViewport(interaction.planView, points);
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
		return screen ? planScreenToWorld(interaction.planView, screen) : null;
	}

	function draftPoint(event: PointerEvent, anchor: LayoutVec2 | null): LayoutVec2 | null {
		const raw = worldPoint(event);
		if (!raw) return null;
		let point = raw;
		if (anchor && event.shiftKey && interaction.planView.angleSnapEnabled) {
			point = constrainToAngle(anchor, point);
		}
		if (interaction.planView.snapEnabled) point = snapToGrid(point);
		return point;
	}

	function isPrimitiveTool(tool: LayoutInteractionState['tool']): tool is 'box' | 'cylinder' | 'sphere' {
		return tool === 'box' || tool === 'cylinder' || tool === 'sphere';
	}

	function updatePrimitiveAt(point: LayoutVec2): void {
		const floor = preview.project.layout.floors[0];
		const draft = interaction.primitiveDraft;
		if (!draft) return;
		const center = primitiveDraftCenter({ ...draft, current: point });
		const allowedRoomIds = new Set((floor?.rooms ?? []).map((room) => room.id));
		const room = findPlanHitRoom(model.queries, center, { allowedRoomIds });
		updateLayoutPrimitiveDraft(interaction, point, room?.roomId);
	}

	function beginInteriorAnchorDrag(
		event: PointerEvent,
		roomId: string,
		segmentId: string,
		anchorId: string
	) {
		if (!svgElement) return;
		if (!dragSnapshot) dragSnapshot = captureLayoutPreviewSnapshot(preview);
		selectLayoutInteriorAnchor(interaction, roomId, segmentId, anchorId);
		interiorAnchorPointerId = event.pointerId;
		draggedInteriorAnchor = { roomId, segmentId, anchorId };
		svgElement.setPointerCapture(event.pointerId);
	}

	function clearActiveLayoutDrag() {
		interiorAnchorPointerId = null;
		draggedInteriorAnchor = null;
		pendingWallBend = null;
		openingDrag = null;
		dragSnapshot = null;
		roomUnitSnapshot = null;
		rotationHoverScreen = null;
		pointerId = null;
	}

	function cancelActiveLayoutDrag() {
		if (dragSnapshot) restoreLayoutPreviewSnapshot(preview, dragSnapshot);
		clearActiveLayoutDrag();
		suppressNextClick = true;
	}

	function beginRoomUnitDrag(event: PointerEvent, room: LayoutRoom, mode: 'translate' | 'rotate', point: LayoutVec2): boolean {
		if (!svgElement || !onLayoutTransactionBegin()) return false;
		roomUnitSnapshot = captureLayoutPreviewSnapshot(preview);
		beginLayoutRoomUnitDrag(interaction, room.id, mode, point, layoutRoomUnitPivot(room));
		pointerId = event.pointerId;
		svgElement.setPointerCapture(event.pointerId);
		return true;
	}

	function rotationHandleHit(screen: LayoutVec2): LayoutRoom | null {
		if (interaction.selection.kind !== 'room') return null;
		const room = findLayoutRoom(rooms, interaction.selection.roomId);
		if (!room) return null;
		const handle = rotationHandleScreenPoint(interaction.planView, interactionProjection);
		return handle && distance(handle, screen) <= LAYOUT_PLAN_HIT_RADIUS_PX ? room : null;
	}

	function beginPendingWallBend(event: PointerEvent) {
		const pending = pendingWallBend;
		if (!pending || pending.pointerId !== event.pointerId) return;
		dragSnapshot = captureLayoutPreviewSnapshot(preview);
		const inserted = insertLayoutWallInteriorAnchor(
			preview,
			pending.roomId,
			pending.segmentId,
			pending.projectionPoint
		);
		pendingWallBend = null;
		if (inserted.success) {
			beginInteriorAnchorDrag(event, pending.roomId, pending.segmentId, inserted.anchorId);
			return;
		}
		dragSnapshot = null;
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
		const point = worldPoint(event);
		const screen = screenPoint(event);
		if (!point || !screen) return;

		if (interaction.tool === 'select') {
			const rotationRoom = rotationHandleHit(screen);
			if (rotationRoom && beginRoomUnitDrag(event, rotationRoom, 'rotate', point)) return;
		}

		if (interaction.tool === 'rectangle') {
			const snapped = draftPoint(event, null);
			if (!snapped || !svgElement) return;
			pointerId = event.pointerId;
			svgElement.setPointerCapture(event.pointerId);
			beginRectangle(interaction, snapped);
			return;
		}

		if (isPrimitiveTool(interaction.tool)) {
			const snapped = draftPoint(event, null);
			if (!snapped || !svgElement) return;
			pointerId = event.pointerId;
			svgElement.setPointerCapture(event.pointerId);
			const allowedRoomIds = new Set((preview.project.layout.floors[0]?.rooms ?? []).map((room) => room.id));
			const room = findPlanHitRoom(model.queries, snapped, { allowedRoomIds });
			beginLayoutPrimitiveDraft(interaction, interaction.tool, snapped, room?.roomId);
			return;
		}

		if (interaction.tool === 'door' || interaction.tool === 'window') {
			const target = resolvePlanHit(model.queries, point, LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter);
			if (target?.kind === 'opening') {
				selectLayoutOpening(interaction, target.roomId, target.segmentId, target.openingId);
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			if (target?.kind === 'wall') {
				onOpeningCreate(target.roomId, target.segmentId, interaction.tool, target.projection.offset);
				setLayoutDraftTool(interaction, 'select');
			}
			return;
		}

		if (interaction.tool !== 'select') return;
		const target = resolvePlanHit(model.queries, point, LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter);
		if (!target) {
			clearLayoutSelection(interaction);
			return;
		}
		if (target.kind === 'vertex') {
			const room = findLayoutRoom(rooms, target.roomId);
			if (!room) return;
			selectLayoutRoom(interaction, target.roomId);
			if (svgElement) {
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginRoomEdit(interaction, 'vertex', target.roomId, point, roomVertices(room), target.vertexIndex);
			}
			return;
		}
		if (target.kind === 'interiorAnchor') {
			beginInteriorAnchorDrag(event, target.roomId, target.segmentId, target.anchorId);
			return;
		}
		if (target.kind === 'opening') {
			const room = findLayoutRoom(rooms, target.roomId);
			const opening = room?.openings.find((candidate) => candidate.id === target.openingId);
			selectLayoutOpening(interaction, target.roomId, target.segmentId, target.openingId);
			if (svgElement) {
				dragSnapshot = captureLayoutPreviewSnapshot(preview);
				openingDrag = {
					roomId: target.roomId,
					segmentId: target.segmentId,
					openingId: target.openingId,
					width: opening?.width ?? 0
				};
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
			}
			return;
		}
		if (target.kind === 'object') {
			const object = model.objects.find((candidate) => candidate.objectId === target.objectId);
			selectLayoutObject(interaction, target.objectId);
			if (object && !object.readonly && svgElement) {
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginLayoutObjectDrag(interaction, target.objectId, object.position);
			}
			return;
		}
		if (target.kind === 'wall') {
			selectLayoutWall(interaction, target.roomId, target.segmentId);
			if (!svgElement) return;
			const projected = interaction.planView.snapEnabled
				? snapToGrid(target.projection.point)
				: target.projection.point;
			pendingWallBend = {
				pointerId: event.pointerId,
				roomId: target.roomId,
				segmentId: target.segmentId,
				projectionPoint: projected,
				originScreen: screen
			};
			svgElement.setPointerCapture(event.pointerId);
			return;
		}

		const room = findLayoutRoom(rooms, target.roomId);
		if (!room) return;
		selectLayoutRoom(interaction, target.roomId);
		beginRoomUnitDrag(event, room, 'translate', point);
	}

	function onPointerMove(event: PointerEvent) {
		if (interaction.tool === 'select' && !interaction.roomUnitDrag) {
			rotationHoverScreen = screenPoint(event);
		}
		if (interaction.primitiveDraft && pointerId === event.pointerId) {
			const point = draftPoint(event, null);
			if (point) updatePrimitiveAt(point);
			return;
		}
		if (panPointerId === event.pointerId && lastPanScreen) {
			const screen = screenPoint(event);
			if (!screen) return;
			panPlanViewport(interaction.planView, [screen[0] - lastPanScreen[0], screen[1] - lastPanScreen[1]]);
			lastPanScreen = screen;
			return;
		}
		if (pendingWallBend && pendingWallBend.pointerId === event.pointerId) {
			const screen = screenPoint(event);
			if (!screen) return;
			if (shouldBeginWallBend(pendingWallBend.originScreen, screen)) {
				beginPendingWallBend(event);
			}
			return;
		}
		if (interiorAnchorPointerId === event.pointerId && draggedInteriorAnchor) {
			const point = worldPoint(event);
			if (!point) return;
			const next = interaction.planView.snapEnabled ? snapToGrid(point) : point;
			updateLayoutWallInteriorAnchor(
				preview,
				draggedInteriorAnchor.roomId,
				draggedInteriorAnchor.segmentId,
				draggedInteriorAnchor.anchorId,
				next
			);
			return;
		}
		if (pointerId !== event.pointerId) return;
		if (interaction.roomUnitDrag && roomUnitSnapshot) {
			const point = worldPoint(event);
			if (!point) return;
			updateLayoutRoomUnitDrag(
				interaction,
				point,
				interaction.planView.snapEnabled,
				interaction.planView.angleSnapEnabled,
				event.shiftKey
			);
			restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
			const result = previewLayoutRoomUnit(preview, interaction.roomUnitDrag.roomId, {
				translation: interaction.roomUnitDrag.translation,
				yaw: interaction.roomUnitDrag.yaw
			});
			if (!result.success) preview.statusMessage = result.message;
			return;
		}
		if (interaction.objectDrag) {
			const point = worldPoint(event);
			if (point) updateLayoutObjectDrag(interaction, point, interaction.planView.snapEnabled);
			return;
		}
		if (openingDrag) {
			const point = worldPoint(event);
			if (!point) return;
			const room = findLayoutRoom(rooms, openingDrag.roomId);
			const segment = room?.boundary.segments.find((candidate) => candidate.id === openingDrag!.segmentId);
			const projection = room && segment
				? projectPointToWall(model.queries, room.id, segment.id, point)
				: null;
			if (!room || !segment || !projection) return;
			const length = compiledWallLength(model.queries, room.id, segment.id);
			const centered = projection.offset - openingDrag.width / 2;
			const offset = interaction.planView.snapEnabled
				? snapSegmentOffset(centered, Math.max(0, length - openingDrag.width))
				: Math.min(Math.max(0, centered), Math.max(0, length - openingDrag.width));
			updateLayoutOpeningFields(preview, openingDrag.roomId, openingDrag.openingId, { offset });
			return;
		}
		if (interaction.tool === 'rectangle') {
			const point = draftPoint(event, interaction.rectangleStart);
			if (point) updateRectangle(interaction, point);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const point = worldPoint(event);
			if (point) updateRoomEdit(interaction, point, interaction.planView.snapEnabled);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (panPointerId === event.pointerId) {
			panPointerId = null;
			lastPanScreen = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (pendingWallBend && pendingWallBend.pointerId === event.pointerId) {
			pendingWallBend = null;
			suppressNextClick = true;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interiorAnchorPointerId === event.pointerId) {
			interiorAnchorPointerId = null;
			draggedInteriorAnchor = null;
			dragSnapshot = null;
			suppressNextClick = true;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (pointerId !== event.pointerId) return;
		if (interaction.primitiveDraft) {
			const point = draftPoint(event, null);
			if (point) updatePrimitiveAt(point);
			const draft = interaction.primitiveDraft;
			if (!draft?.valid || !draft.roomId) {
				preview.statusMessage = 'Choose a non-zero gesture inside a first-floor room';
			} else {
				const result = commitLayoutPrimitive(
					preview,
					draft.kind,
					draft.start,
					draft.current,
					draft.roomId,
					interaction.planView.snapEnabled
				);
				if (result.success) {
					selectLayoutObject(interaction, result.objectId);
					preview.statusMessage = `Created ${draft.kind} object`;
				} else {
					preview.statusMessage = result.message;
				}
			}
			cancelLayoutPrimitiveDraft(interaction);
			pointerId = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interaction.roomUnitDrag) {
			const changed = onLayoutTransactionCommit();
			if (!changed && roomUnitSnapshot) restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
			cancelLayoutRoomUnitDrag(interaction);
			roomUnitSnapshot = null;
			rotationHoverScreen = null;
			pointerId = null;
			preview.statusMessage = changed ? 'Moved room unit' : preview.statusMessage;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interaction.objectDrag) {
			const drag = interaction.objectDrag;
			const result = updateLayoutObjectFields(preview, drag.objectId, {
				position: drag.candidatePosition
			});
			cancelLayoutObjectDrag(interaction);
			pointerId = null;
			preview.statusMessage = result.success ? 'Moved layout object' : result.message;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		pointerId = null;
		openingDrag = null;
		dragSnapshot = null;
		svgElement?.releasePointerCapture(event.pointerId);
		if (interaction.tool === 'rectangle') {
			const points = rectanglePoints(interaction);
			if (points && onCommit(points)) clearLayoutDraft(interaction);
			else if (!points) clearLayoutDraft(interaction);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const edit = interaction.editing;
			commitLayoutRoomEdit(preview, edit.roomId, edit.currentPoints);
			cancelRoomEdit(interaction);
		}
	}

	function onPointerCancel(event: PointerEvent) {
		if (interaction.primitiveDraft && pointerId === event.pointerId) {
			cancelLayoutPrimitiveDraft(interaction);
			pointerId = null;
		}
		if (interaction.roomUnitDrag && pointerId === event.pointerId) {
			onLayoutTransactionCancel();
			cancelLayoutRoomUnitDrag(interaction);
			roomUnitSnapshot = null;
			rotationHoverScreen = null;
			pointerId = null;
		}
		if (svgElement?.hasPointerCapture(event.pointerId)) svgElement.releasePointerCapture(event.pointerId);
	}

	function onClick(event: MouseEvent) {
		if (suppressNextClick) {
			suppressNextClick = false;
			return;
		}
		if (interaction.tool !== 'polygon') return;
		const point = worldPoint(event);
		if (!point) return;
		const anchor = interaction.polygonPoints.at(-1) ?? null;
		let nextPoint = point;
		if (anchor && event.shiftKey && interaction.planView.angleSnapEnabled) nextPoint = constrainToAngle(anchor, nextPoint);
		if (interaction.planView.snapEnabled) nextPoint = snapToGrid(nextPoint);
		const first = interaction.polygonPoints[0];
		const closeDistance = 14 / interaction.planView.pixelsPerMeter;
		if (first && interaction.polygonPoints.length >= 3 && distance(first, nextPoint) <= closeDistance) {
			if (onCommit([...interaction.polygonPoints])) clearLayoutDraft(interaction);
			return;
		}
		addPolygonPoint(interaction, nextPoint);
	}

	function finishPolygon() {
		if (interaction.polygonPoints.length < 3) return;
		if (onCommit([...interaction.polygonPoints])) clearLayoutDraft(interaction);
	}

	function onWheel(event: WheelEvent) {
		const screen = screenPoint(event);
		if (!screen) return;
		event.preventDefault();
		zoomPlanViewport(interaction.planView, event.deltaY < 0 ? 1.12 : 1 / 1.12, screen);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			if (pendingWallBend) {
				const pendingPointerId = pendingWallBend.pointerId;
				pendingWallBend = null;
				suppressNextClick = true;
				svgElement?.releasePointerCapture(pendingPointerId);
				return;
			}
			if (interaction.roomUnitDrag) {
				onLayoutTransactionCancel();
				cancelLayoutRoomUnitDrag(interaction);
				roomUnitSnapshot = null;
				rotationHoverScreen = null;
				pointerId = null;
				return;
			}
			if (dragSnapshot || draggedInteriorAnchor || openingDrag) {
				cancelActiveLayoutDrag();
				return;
			}
			if (interaction.objectDrag) {
				cancelLayoutObjectDrag(interaction);
				pointerId = null;
				return;
			}
			if (interaction.primitiveDraft) {
				cancelLayoutPrimitiveDraft(interaction);
				pointerId = null;
				return;
			}
			if (interaction.tool === 'door' || interaction.tool === 'window') {
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			clearLayoutDraft(interaction);
			cancelRoomEdit(interaction);
			return;
		}
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			interaction.tool === 'select' &&
			interaction.selection.kind === 'interiorAnchor'
		) {
			event.preventDefault();
			const selection = interaction.selection;
			const result = deleteLayoutWallInteriorAnchor(
				preview,
				selection.roomId,
				selection.segmentId,
				selection.anchorId
			);
			if (result.success) {
				selectLayoutWall(interaction, selection.roomId, selection.segmentId);
			}
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'opening') {
			event.preventDefault();
			onOpeningDelete(interaction.selection.roomId, interaction.selection.openingId);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'object') {
			event.preventDefault();
			const result = deleteLayoutObject(preview, interaction.selection.objectId);
			if (result.success) clearLayoutSelection(interaction);
			preview.statusMessage = result.success ? 'Deleted layout object' : result.message;
			return;
		}
		// H1 S2.1 — room deletion is a guarded layout transaction (the caller
		// owns begin/commit/cancel + the scene-reference reject policy).
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'room') {
			event.preventDefault();
			onRoomDelete(interaction.selection.roomId);
			return;
		}
		if (event.key === 'Backspace' && interaction.tool === 'polygon' && interaction.polygonPoints.length > 0) {
			event.preventDefault();
			removeLastPolygonPoint(interaction);
		}
	}

	function distance(a: LayoutVec2, b: LayoutVec2): number {
		return Math.hypot(a[0] - b[0], a[1] - b[1]);
	}

	function findLayoutRoom(roomList: readonly LayoutRoom[], roomId: string): LayoutRoom | undefined {
		return roomList.find((room) => room.id === roomId);
	}

	function roomVertices(room: LayoutRoom): LayoutVec2[] {
		return room.boundary.segments.map((segment) => [...segment.start] as LayoutVec2);
	}

</script>

<div class="plan-viewport" aria-label="Layout Plan drafting viewport">
	<div class="plan-help" role="status">
		{#if interaction.tool === 'rectangle'}
			Drag to draw a rectangle · Shift angle snap · Escape cancels
		{:else if interaction.tool === 'polygon'}
			Click points · Backspace removes last · click first or Finish · Escape cancels
		{:else if interaction.tool === 'door' || interaction.tool === 'window'}
			Click any wall to place a {interaction.tool} · click existing opening to select · Escape returns to Select
		{:else if interaction.tool === 'box' || interaction.tool === 'cylinder' || interaction.tool === 'sphere'}
			{#if interaction.tool === 'box'}Drag opposite corners to place a box{:else}Drag from center to set {interaction.tool} radius{/if} · Escape cancels
		{:else}
			Click wall to select · drag mid-span to bend · drag anchors · openings · middle-drag pans · wheel zooms
		{/if}
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (plan surface owns keyboard focus) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (plan surface owns pointer and keyboard drafting events) -->
	<svg
		bind:this={svgElement}
		class="plan-canvas"
		class:rotation-handle-hover={rotationHandleHovered}
		class:rotation-dragging={Boolean(interaction.roomUnitDrag)}
		viewBox={viewBox}
		preserveAspectRatio="none"
		role="application"
		tabindex="0"
		aria-label="2D layout plan"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onclick={onClick}
		onwheel={onWheel}
		onkeydown={onKeyDown}
		onpointerleave={() => (rotationHoverScreen = null)}
	>
		{#if interaction.planView.gridEnabled}
			{#each gridLines as line (line.id)}
				<line class:major={line.major} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} />
			{/each}
			{#each gridLines.filter((line) => line.major) as line (`label-${line.id}`)}
				<text class="grid-label" x={line.start[0] + 4} y={line.start[1] + 12}>{line.value.toFixed(0)} m</text>
			{/each}
		{/if}
		<PlanSvg model={planModel} planView={interaction.planView} />
		{#if selectedOpening}
			<text class="selection-label" x="16" y="24">{selectedOpening.kind} · {selectedOpening.width.toFixed(2)} m × {selectedOpening.height.toFixed(2)} m</text>
		{/if}
		<text class="scale-label" x="16" y={interaction.planView.height - 18}>{scaleMeters.toFixed(2)} m / 100 px</text>
		<line class="scale-bar" x1="16" y1={interaction.planView.height - 10} x2="116" y2={interaction.planView.height - 10} />
	</svg>
	<div class="plan-actions">
		{#if interaction.tool === 'polygon' && interaction.polygonPoints.length >= 3}
			<button type="button" onclick={finishPolygon}>Finish polygon</button>
		{/if}
		{#if draftPolygon && draftPolygon.length > 0}
			<button type="button" class="secondary" onclick={() => clearLayoutDraft(interaction)}>Cancel draft</button>
		{/if}
	</div>
		<div class="plan-meta">
			<span>{preview.model.rooms.length} rooms</span>
			<span>{preview.model.objects.length} objects</span>
		<span>{preview.issues.length} geometry warnings</span>
		{#if interaction.selection.kind !== 'none'}<span>Selected: {interaction.selection.kind}</span>{/if}
		{#if preview.lastMutationMessage}<span class="warning">{preview.lastMutationMessage}</span>{/if}
	</div>
</div>

<style>
	.plan-viewport { position: absolute; inset: 0; z-index: 3; background: #0d0d12; }
	.plan-canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; outline: none; }
	.plan-canvas.rotation-handle-hover { cursor: grab; }
	.plan-canvas.rotation-dragging { cursor: grabbing; }
	.plan-canvas line { stroke: #302d38; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.plan-canvas line.major { stroke: #494352; }
	.grid-label { fill: #746d7d; font: 10px ui-monospace, monospace; pointer-events: none; }
	.selection-label { fill: #f1d99a; font: 700 12px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.scale-label { fill: #d6d0c4; font: 11px ui-monospace, monospace; }
	.scale-bar { stroke: #fff2c7; stroke-width: 3; vector-effect: non-scaling-stroke; }
	.plan-help { position: absolute; top: 4.25rem; left: 50%; z-index: 5; max-width: min(34rem, calc(100% - 2rem)); transform: translateX(-50%); padding: 0.45rem 0.7rem; border: 1px solid #49433a; border-radius: 999px; background: rgb(18 18 24 / 92%); color: #fff2c7; font: 600 0.7rem/1.2 ui-sans-serif, system-ui, sans-serif; pointer-events: none; text-align: center; }
	.plan-actions { position: absolute; right: 0.8rem; bottom: 0.8rem; z-index: 10; display: flex; gap: 0.4rem; pointer-events: auto; }
	.plan-actions button { padding: 0.44rem 0.6rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #2a2618; color: #fff2c7; font: 600 0.7rem/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
	.plan-actions button.secondary { border-color: #4a4650; background: #1a1a22; color: #d6d0c4; }
	.plan-meta { position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.7rem; color: #a8a29a; font: 0.68rem/1 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
	.plan-meta .warning { color: #efc7c7; }
	@media (max-width: 44rem) {
		.plan-help { top: 5.5rem; }
	}
</style>
