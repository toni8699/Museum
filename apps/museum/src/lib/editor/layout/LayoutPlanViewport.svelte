<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import {
		addPolygonPoint,
		beginLayoutObjectDrag,
		beginLayoutPrimitiveDraft,
		beginRectangle,
		beginRoomEdit,
		cancelLayoutObjectDrag,
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
		selectedLayoutRoomId,
		shouldBeginWallBend,
		updateRectangle,
		updateLayoutObjectDrag,
		updateLayoutPrimitiveDraft,
		updateRoomEdit,
		primitiveDraftFootprint,
		primitiveDraftCenter,
		rectanglePoints,
		type LayoutInteractionState
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutPrimitive,
		commitLayoutRoomEdit,
		deleteLayoutObject,
		deleteLayoutWallInteriorAnchor,
		insertLayoutWallInteriorAnchor,
		restoreLayoutPreviewSnapshot,
		updateLayoutObjectFields,
		updateLayoutWallInteriorAnchor,
		updateLayoutOpeningFields,
		type LayoutPreviewSnapshot
	} from './layout-preview-state.svelte';
	import { pointInRoom, roomEdgeLength, roomPoints } from './layout-editing';
	import {
		openingContainsOffset,
		openingSamplePolyline,
		projectPointToDraftSegment,
		snapSegmentOffset,
		wallPolylinesAroundOpenings,
		LAYOUT_PLAN_HIT_RADIUS_PX,
		type LayoutOpeningKind
	} from './layout-opening-editing';
	import { segmentLength } from './curve-geometry';
	import {
		buildPlanGrid,
		constrainToAngle,
		framePlanViewport,
		panPlanViewport,
		planScreenToWorld,
		setPlanViewportSize,
		snapToGrid,
		worldToPlanScreen,
		zoomPlanViewport,
		type PlanGridLine
	} from './layout-plan-transform';
	import type { DraftSegment, LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';
	import {
		findHitLayoutObject,
		type LayoutObjectDescriptor
	} from './layout-object-editing';

	let {
		model,
		preview,
		interaction,
		onCommit,
		onOpeningCreate,
		onOpeningDelete
	}: {
		model: LayoutPreviewModel;
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
		onCommit: (points: LayoutVec2[]) => boolean;
		onOpeningCreate: (roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) => void;
		onOpeningDelete: (roomId: string, openingId: string) => void;
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

	const viewBox = $derived(`0 0 ${interaction.planView.width} ${interaction.planView.height}`);
	const gridLines = $derived<PlanGridLine[]>(buildPlanGrid(interaction.planView));
	const draftPolygon = $derived(
		interaction.tool === 'rectangle'
			? rectanglePoints(interaction)
			: interaction.polygonPoints
	);
	const scaleMeters = $derived(100 / interaction.planView.pixelsPerMeter);
	const rooms = $derived(preview.project.layout.floors.flatMap((floor) => floor.rooms));
	const selectedRoom = $derived.by(() => {
		const roomId = selectedLayoutRoomId(interaction);
		return roomId ? findLayoutRoom(rooms, roomId) : undefined;
	});
	const selectedOpeningSelection = $derived(
		interaction.selection.kind === 'opening' ? interaction.selection : null
	);
	const selectedOpening = $derived.by(() => {
		if (!selectedOpeningSelection) return undefined;
		return findLayoutRoom(rooms, selectedOpeningSelection.roomId)?.openings.find(
			(opening) => opening.id === selectedOpeningSelection.openingId
		);
	});
	const visibleInteriorAnchors = $derived.by(() => {
		const anchors: { roomId: string; segmentId: string; anchorId: string; point: LayoutVec2 }[] = [];
		for (const room of rooms) {
			for (const segment of room.boundary.segments) {
				if (segment.kind !== 'auto-bezier' || segment.interiorAnchors.length === 0) continue;
				for (const anchor of segment.interiorAnchors) {
					anchors.push({
						roomId: room.id,
						segmentId: segment.id,
						anchorId: anchor.id,
						point: anchor.point
					});
				}
			}
		}
		return anchors;
	});
	const selectedPoints = $derived.by(() => {
		if (!selectedRoom) return [] as LayoutVec2[];
		if (interaction.editing?.roomId === selectedRoom.id) return interaction.editing.currentPoints;
		return roomPoints(selectedRoom);
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

	function renderObjectFootprint(object: LayoutObjectDescriptor): LayoutVec2[] {
		const drag = interaction.objectDrag;
		if (!drag || drag.objectId !== object.objectId) return object.planFootprint;
		const dx = drag.candidatePosition[0] - drag.originalPosition[0];
		const dz = drag.candidatePosition[2] - drag.originalPosition[2];
		return object.planFootprint.map(([x, z]) => [x + dx, z + dz]);
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
		const room = floor ? findHitRoom(floor.rooms, center) : undefined;
		updateLayoutPrimitiveDraft(interaction, point, room?.id);
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
		pointerId = null;
	}

	function cancelActiveLayoutDrag() {
		if (dragSnapshot) restoreLayoutPreviewSnapshot(preview, dragSnapshot);
		clearActiveLayoutDrag();
		suppressNextClick = true;
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
			beginLayoutPrimitiveDraft(
				interaction,
				interaction.tool,
				snapped,
				findHitRoom(preview.project.layout.floors[0]?.rooms ?? [], snapped)?.id
			);
			return;
		}

		if (interaction.tool === 'door' || interaction.tool === 'window') {
			const target = findPlanHitTarget(point, screen);
			if (target?.kind === 'opening') {
				selectLayoutOpening(interaction, target.room.id, target.segment.id, target.opening.id);
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			if (target?.kind === 'wall') {
				onOpeningCreate(target.room.id, target.segment.id, interaction.tool, target.projection.offset);
				setLayoutDraftTool(interaction, 'select');
			}
			return;
		}

		if (interaction.tool !== 'select') return;
		const target = findPlanHitTarget(point, screen);
		if (!target) {
			clearLayoutSelection(interaction);
			return;
		}
		if (target.kind === 'vertex') {
			selectLayoutRoom(interaction, target.room.id);
			if (svgElement) {
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginRoomEdit(interaction, 'vertex', target.room.id, point, roomPoints(target.room), target.vertexIndex);
			}
			return;
		}
		if (target.kind === 'interiorAnchor') {
			beginInteriorAnchorDrag(event, target.room.id, target.segment.id, target.anchor.id);
			return;
		}
		if (target.kind === 'opening') {
			selectLayoutOpening(interaction, target.room.id, target.segment.id, target.opening.id);
			if (svgElement) {
				dragSnapshot = captureLayoutPreviewSnapshot(preview);
				openingDrag = {
					roomId: target.room.id,
					segmentId: target.segment.id,
					openingId: target.opening.id,
					width: target.opening.width
				};
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
			}
			return;
		}
		if (target.kind === 'object') {
			selectLayoutObject(interaction, target.object.objectId);
			if (!target.object.readonly && svgElement) {
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginLayoutObjectDrag(interaction, target.object.objectId, target.object.position);
			}
			return;
		}
		if (target.kind === 'wall') {
			selectLayoutWall(interaction, target.room.id, target.segment.id);
			if (!svgElement) return;
			const projected = interaction.planView.snapEnabled
				? snapToGrid(target.projection.point)
				: target.projection.point;
			pendingWallBend = {
				pointerId: event.pointerId,
				roomId: target.room.id,
				segmentId: target.segment.id,
				projectionPoint: projected,
				originScreen: screen
			};
			svgElement.setPointerCapture(event.pointerId);
			return;
		}

		selectLayoutRoom(interaction, target.room.id);
		if (svgElement) {
			pointerId = event.pointerId;
			svgElement.setPointerCapture(event.pointerId);
			beginRoomEdit(interaction, 'room', target.room.id, point, roomPoints(target.room));
		}
	}

	function onPointerMove(event: PointerEvent) {
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
			if (!segment) return;
			const projection = projectPointToDraftSegment(point, segment);
			const length = segmentLength(segment);
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
		if (event.key === 'Backspace' && interaction.tool === 'polygon' && interaction.polygonPoints.length > 0) {
			event.preventDefault();
			removeLastPolygonPoint(interaction);
		}
	}

	function findPlanHitTarget(point: LayoutVec2, screen: LayoutVec2): PlanHitTarget | null {
		const vertex = nearestVertexTarget(screen);
		if (vertex) return vertex;
		const interiorAnchor = nearestInteriorAnchorTarget(screen);
		if (interiorAnchor) return interiorAnchor;
		const opening = nearestOpeningTarget(point);
		if (opening) return opening;
		const object = findHitLayoutObject(model.objects, point);
		if (object) return { kind: 'object', object };
		const wall = nearestWallTarget(point);
		if (wall) return wall;
		const room = findHitRoom(rooms, point);
		return room ? { kind: 'room', room } : null;
	}

	function nearestVertexTarget(screen: LayoutVec2): VertexHitTarget | null {
		let nearest: VertexHitTarget | null = null;
		let nearestDistance = LAYOUT_PLAN_HIT_RADIUS_PX;
		for (const room of rooms) {
			roomPoints(room).forEach((point, vertexIndex) => {
				const candidate = worldToPlanScreen(interaction.planView, point);
				const currentDistance = Math.hypot(candidate[0] - screen[0], candidate[1] - screen[1]);
				if (currentDistance <= nearestDistance) {
					nearest = { kind: 'vertex', room, vertexIndex };
					nearestDistance = currentDistance;
				}
			});
		}
		return nearest;
	}

	function nearestInteriorAnchorTarget(screen: LayoutVec2): InteriorAnchorHitTarget | null {
		let nearest: InteriorAnchorHitTarget | null = null;
		let nearestDistance = LAYOUT_PLAN_HIT_RADIUS_PX;
		for (const room of rooms) {
			for (const segment of room.boundary.segments) {
				if (segment.kind !== 'auto-bezier') continue;
				for (const anchor of segment.interiorAnchors) {
					const handle = worldToPlanScreen(interaction.planView, anchor.point);
					const currentDistance = Math.hypot(handle[0] - screen[0], handle[1] - screen[1]);
					if (currentDistance <= nearestDistance) {
						nearest = { kind: 'interiorAnchor', room, segment, anchor };
						nearestDistance = currentDistance;
					}
				}
			}
		}
		return nearest;
	}

	function nearestOpeningTarget(point: LayoutVec2): OpeningHitTarget | null {
		const tolerance = LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter;
		for (const room of [...rooms].reverse()) {
			for (const opening of [...room.openings].reverse()) {
				const segment = room.boundary.segments.find((candidate) => candidate.id === opening.segmentId);
				if (!segment) continue;
				const projection = projectPointToDraftSegment(point, segment);
				if (projection.distance <= tolerance && openingContainsOffset(opening, projection.offset, tolerance)) {
					return { kind: 'opening', room, segment, opening, projection };
				}
			}
		}
		return null;
	}

	function nearestWallTarget(point: LayoutVec2): WallHitTarget | null {
		const tolerance = LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter;
		let nearest: WallHitTarget | null = null;
		for (const room of [...rooms].reverse()) {
			for (const segment of [...room.boundary.segments].reverse()) {
				const projection = projectPointToDraftSegment(point, segment);
				if (projection.distance <= tolerance && (!nearest || projection.distance < nearest.projection.distance)) {
					nearest = { kind: 'wall', room, segment, projection };
				}
			}
		}
		return nearest;
	}

	function distance(a: LayoutVec2, b: LayoutVec2): number {
		return Math.hypot(a[0] - b[0], a[1] - b[1]);
	}

	function findHitRoom(roomList: readonly LayoutRoom[], point: LayoutVec2): LayoutRoom | undefined {
		return [...roomList].reverse().find((room) => pointInRoom(point, room));
	}

	function findLayoutRoom(roomList: readonly LayoutRoom[], roomId: string): LayoutRoom | undefined {
		return roomList.find((room) => room.id === roomId);
	}

	function renderPoints(roomId: string, fallback: LayoutVec2[]): LayoutVec2[] {
		return interaction.editing?.roomId === roomId ? interaction.editing.currentPoints : fallback;
	}

	function isWallSelected(segmentId: string): boolean {
		const selection = interaction.selection;
		return (
			(selection.kind === 'wall' || selection.kind === 'interiorAnchor') &&
			selection.segmentId === segmentId
		);
	}

	type VertexHitTarget = { kind: 'vertex'; room: LayoutRoom; vertexIndex: number };
	type InteriorAnchorHitTarget = {
		kind: 'interiorAnchor';
		room: LayoutRoom;
		segment: Extract<DraftSegment, { kind: 'auto-bezier' }>;
		anchor: Extract<DraftSegment, { kind: 'auto-bezier' }>['interiorAnchors'][number];
	};
	type OpeningHitTarget = {
		kind: 'opening';
		room: LayoutRoom;
		segment: DraftSegment;
		opening: LayoutOpening;
		projection: ReturnType<typeof projectPointToDraftSegment>;
	};
	type WallHitTarget = {
		kind: 'wall';
		room: LayoutRoom;
		segment: DraftSegment;
		projection: ReturnType<typeof projectPointToDraftSegment>;
	};
	type ObjectHitTarget = { kind: 'object'; object: LayoutObjectDescriptor };
	type PlanHitTarget =
		| VertexHitTarget
		| InteriorAnchorHitTarget
		| OpeningHitTarget
		| ObjectHitTarget
		| WallHitTarget
		| { kind: 'room'; room: LayoutRoom };
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
	>
		{#if interaction.planView.gridEnabled}
			{#each gridLines as line (line.id)}
				<line class:major={line.major} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} />
			{/each}
			{#each gridLines.filter((line) => line.major) as line (`label-${line.id}`)}
				<text class="grid-label" x={line.start[0] + 4} y={line.start[1] + 12}>{line.value.toFixed(0)} m</text>
			{/each}
		{/if}
		{#each model.rooms as room (room.roomId)}
			{@const layoutRoom = findLayoutRoom(rooms, room.roomId)}
			{@const points = renderPoints(room.roomId, room.floorPolygon)}
			<polygon
				class="room-fill"
				class:selected={interaction.selection.kind === 'room' && interaction.selection.roomId === room.roomId}
				points={points.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')}
				aria-label={`Room ${room.roomId}`}
			/>
			<polyline
				class="room-outline"
				class:selected={interaction.selection.kind === 'room' && interaction.selection.roomId === room.roomId}
				points={[...points, points[0]].map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')}
			/>
			{#each room.walls as wall (wall.segmentId)}
				{@const wallOpenings = layoutRoom?.openings.filter((opening) => opening.segmentId === wall.segmentId) ?? []}
				{#each wallPolylinesAroundOpenings(wall.samples, wallOpenings) as polyline, polylineIndex (`${wall.segmentId}:span:${polylineIndex}`)}
					<polyline
						class="wall-line"
						class:selected={isWallSelected(wall.segmentId)}
						class:opening-selected={interaction.selection.kind === 'opening' && interaction.selection.segmentId === wall.segmentId}
						points={polyline.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')}
					/>
				{/each}
			{/each}
			{#if layoutRoom}
				{#each layoutRoom.openings as opening (opening.id)}
					{@const segment = layoutRoom.boundary.segments.find((candidate) => candidate.id === opening.segmentId)}
					{#if segment}
						{@const openingPoints = openingSamplePolyline(segment, opening).map((point) => worldToPlanScreen(interaction.planView, point))}
						<polyline
							class="opening-line"
							class:opening-selected={interaction.selection.kind === 'opening' && interaction.selection.openingId === opening.id}
							points={openingPoints.map((point) => point.join(',')).join(' ')}
						/>
					{/if}
				{/each}
			{/if}
			{/each}
			{#each model.objects as object (object.objectId)}
				{@const footprint = renderObjectFootprint(object)}
				<polygon
					class="layout-object"
					class:selected={interaction.selection.kind === 'object' && interaction.selection.objectId === object.objectId}
					class:readonly={object.readonly}
					points={footprint.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')}
				/>
			{/each}
			{#if interaction.primitiveDraft}
				{@const draft = interaction.primitiveDraft}
				{@const footprint = primitiveDraftFootprint(draft)}
				<polygon
					class="primitive-ghost"
					class:circle={draft.kind !== 'box'}
					class:sphere={draft.kind === 'sphere'}
					class:invalid={!draft.valid}
					points={footprint.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')}
				/>
			{/if}
			{#if interaction.selection.kind === 'room' && selectedPoints.length > 0}
			{#each selectedPoints as point, index (index)}
				{@const screen = worldToPlanScreen(interaction.planView, point)}
				<circle class="vertex-handle" cx={screen[0]} cy={screen[1]} r="6" />
			{/each}
			{#each selectedPoints as point, index (index)}
				{@const next = selectedPoints[(index + 1) % selectedPoints.length]!}
				{@const start = worldToPlanScreen(interaction.planView, point)}
				{@const end = worldToPlanScreen(interaction.planView, next)}
				{@const edgeLength = selectedRoom ? roomEdgeLength(selectedRoom, index) : Math.hypot(next[0] - point[0], next[1] - point[1])}
				<text class="dimension-label" x={(start[0] + end[0]) / 2} y={(start[1] + end[1]) / 2 - 5}>{edgeLength.toFixed(2)} m</text>
			{/each}
		{/if}
		{#if draftPolygon && draftPolygon.length > 0}
			<polyline class="draft-outline" points={draftPolygon.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')} />
			{#each draftPolygon as point, index (index)}
				{@const screen = worldToPlanScreen(interaction.planView, point)}
				<circle class="draft-point" cx={screen[0]} cy={screen[1]} r="5" />
			{/each}
		{/if}
		{#each visibleInteriorAnchors as anchor (`${anchor.segmentId}:${anchor.anchorId}`)}
			{@const screen = worldToPlanScreen(interaction.planView, anchor.point)}
			<circle
				class="interior-anchor"
				class:selected={interaction.selection.kind === 'interiorAnchor' && interaction.selection.anchorId === anchor.anchorId}
				cx={screen[0]}
				cy={screen[1]}
				r="5"
			/>
		{/each}
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
	.plan-viewport { position: absolute; inset: 0; background: #0d0d12; }
	.plan-canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; outline: none; }
	.plan-canvas line { stroke: #302d38; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.plan-canvas line.major { stroke: #494352; }
	.grid-label { fill: #746d7d; font: 10px ui-monospace, monospace; pointer-events: none; }
	.room-fill { fill: #6b6254; fill-opacity: 0.32; }
	.room-fill.selected { fill: #9b7841; fill-opacity: 0.45; }
	.room-outline { fill: none; stroke: #88b7d6; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.room-outline.selected { stroke: #f1cd78; stroke-width: 3; }
	.wall-line { fill: none; stroke: #b2a58f; stroke-width: 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-line.selected { stroke: #fff2c7; stroke-width: 6; }
	.wall-line.opening-selected { stroke: #d6b35f; stroke-width: 6; }
	.opening-line { stroke: #77c6b0; stroke-width: 7; vector-effect: non-scaling-stroke; pointer-events: none; }
	.opening-line.opening-selected { stroke: #fff2c7; stroke-width: 9; }
	.layout-object { fill: #73806d; fill-opacity: 0.62; stroke: #b7c4ae; stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
	.layout-object.selected { fill: #9b7841; stroke: #fff2c7; stroke-width: 3; }
	.layout-object.readonly { fill: #6b6576; stroke-dasharray: 5 3; }
	.primitive-ghost { fill: #d6b35f; fill-opacity: 0.25; stroke: #f1d99a; stroke-width: 2; stroke-dasharray: 7 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.primitive-ghost.circle { fill: #77c6b0; stroke: #b8f0de; }
	.primitive-ghost.sphere { fill: #aa8ed4; stroke: #e0cfff; }
	.primitive-ghost.invalid { fill: #d96b6b; stroke: #efc7c7; }
	.interior-anchor { fill: #d6b35f; stroke: #fff2c7; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.interior-anchor.selected { fill: #fff2c7; stroke: #d6b35f; }
	.vertex-handle { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.dimension-label, .selection-label { fill: #f1d99a; font: 10px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.selection-label { font-size: 12px; font-weight: 700; }
	.draft-outline { fill: rgba(214, 179, 95, 0.18); stroke: #d6b35f; stroke-width: 2; stroke-dasharray: 8 4; vector-effect: non-scaling-stroke; }
	.draft-point { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
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
