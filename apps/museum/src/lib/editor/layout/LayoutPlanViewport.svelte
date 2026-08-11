<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import {
		addPolygonPoint,
		beginRectangle,
		beginRoomEdit,
		cancelRoomEdit,
		clearLayoutDraft,
		clearLayoutSelection,
		selectLayoutOpening,
		selectLayoutRoom,
		selectLayoutWall,
		setLayoutDraftTool,
		removeLastPolygonPoint,
		selectedLayoutRoomId,
		updateRectangle,
		updateRoomEdit,
		rectanglePoints,
		type LayoutInteractionState
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import { commitLayoutRoomEdit } from './layout-preview-state.svelte';
	import { pointInRoom, roomPoints } from './layout-editing';
	import {
		openingContainsOffset,
		projectPointToSegment,
		segmentPointAtOffset,
		LAYOUT_PLAN_HIT_RADIUS_PX,
		type LayoutOpeningKind
	} from './layout-opening-editing';
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
		onCommit: (points: LayoutVec2[]) => void;
		onOpeningCreate: (roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) => void;
		onOpeningDelete: (roomId: string, openingId: string) => void;
	} = $props();

	let svgElement = $state<SVGSVGElement>();
	let pointerId = $state<number | null>(null);
	let panPointerId = $state<number | null>(null);
	let lastPanScreen = $state<LayoutVec2 | null>(null);
	let lastSource = $state<string | null>(null);

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
		if (interaction.viewMode !== 'plan') return;
		if (lastSource === preview.source && interaction.planView.initialized) return;
		lastSource = preview.source;
		frameView();
	});

	function frameView() {
		const points = model.rooms.flatMap((room) => room.floorPolygon);
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
		if (target.kind === 'opening') {
			selectLayoutOpening(interaction, target.room.id, target.segment.id, target.opening.id);
			return;
		}
		if (target.kind === 'wall') {
			selectLayoutWall(interaction, target.room.id, target.segment.id);
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
		if (panPointerId === event.pointerId && lastPanScreen) {
			const screen = screenPoint(event);
			if (!screen) return;
			panPlanViewport(interaction.planView, [screen[0] - lastPanScreen[0], screen[1] - lastPanScreen[1]]);
			lastPanScreen = screen;
			return;
		}
		if (pointerId !== event.pointerId) return;
		if (interaction.tool === 'rectangle') {
			const point = draftPoint(event, interaction.rectangleStart);
			if (point) updateRectangle(interaction, point);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const point = worldPoint(event);
			if (point) updateRoomEdit(interaction, point);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (panPointerId === event.pointerId) {
			panPointerId = null;
			lastPanScreen = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (pointerId !== event.pointerId) return;
		pointerId = null;
		svgElement?.releasePointerCapture(event.pointerId);
		if (interaction.tool === 'rectangle') {
			const points = rectanglePoints(interaction);
			if (points) onCommit(points);
			clearLayoutDraft(interaction);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const edit = interaction.editing;
			commitLayoutRoomEdit(preview, edit.roomId, edit.currentPoints);
			cancelRoomEdit(interaction);
		}
	}

	function onClick(event: MouseEvent) {
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
			onCommit([...interaction.polygonPoints]);
			clearLayoutDraft(interaction);
			return;
		}
		addPolygonPoint(interaction, nextPoint);
	}

	function finishPolygon() {
		if (interaction.polygonPoints.length < 3) return;
		onCommit([...interaction.polygonPoints]);
		clearLayoutDraft(interaction);
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
			if (interaction.tool === 'door' || interaction.tool === 'window') {
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			clearLayoutDraft(interaction);
			cancelRoomEdit(interaction);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'opening') {
			event.preventDefault();
			onOpeningDelete(interaction.selection.roomId, interaction.selection.openingId);
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
		const opening = nearestOpeningTarget(point);
		if (opening) return opening;
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

	function nearestOpeningTarget(point: LayoutVec2): OpeningHitTarget | null {
		const tolerance = LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter;
		for (const room of [...rooms].reverse()) {
			for (const opening of [...room.openings].reverse()) {
				const segment = room.boundary.segments.find((candidate) => candidate.id === opening.segmentId);
				if (!segment || segment.kind !== 'line') continue;
				const projection = projectPointToSegment(point, segment.start, segment.end);
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
				if (segment.kind !== 'line') continue;
				const projection = projectPointToSegment(point, segment.start, segment.end);
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

	type VertexHitTarget = { kind: 'vertex'; room: LayoutRoom; vertexIndex: number };
	type OpeningHitTarget = { kind: 'opening'; room: LayoutRoom; segment: Extract<DraftSegment, { kind: 'line' }>; opening: LayoutOpening; projection: ReturnType<typeof projectPointToSegment> };
	type WallHitTarget = { kind: 'wall'; room: LayoutRoom; segment: Extract<DraftSegment, { kind: 'line' }>; projection: ReturnType<typeof projectPointToSegment> };
	type PlanHitTarget = VertexHitTarget | OpeningHitTarget | WallHitTarget | { kind: 'room'; room: LayoutRoom };
</script>

<div class="plan-viewport" aria-label="Layout Plan drafting viewport">
	<div class="plan-help" role="status">
		{#if interaction.tool === 'rectangle'}
			Drag to draw a rectangle · Shift angle snap · Escape cancels
		{:else if interaction.tool === 'polygon'}
			Click points · Backspace removes last · click first or Finish · Escape cancels
		{:else if interaction.tool === 'door' || interaction.tool === 'window'}
			Click any wall to place a {interaction.tool} · click existing opening to select · Escape returns to Select
		{:else}
			Click vertex, opening, wall, or room · middle-drag pans · wheel zooms
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
				{@const wallStart = worldToPlanScreen(interaction.planView, wall.start)}
				{@const wallEnd = worldToPlanScreen(interaction.planView, wall.end)}
				<line
					class="wall-line"
					class:selected={interaction.selection.kind === 'wall' && interaction.selection.segmentId === wall.segmentId}
					class:opening-selected={interaction.selection.kind === 'opening' && interaction.selection.segmentId === wall.segmentId}
					x1={wallStart[0]} y1={wallStart[1]} x2={wallEnd[0]} y2={wallEnd[1]}
				/>
			{/each}
			{#if layoutRoom}
				{#each layoutRoom.openings as opening (opening.id)}
					{@const segment = layoutRoom.boundary.segments.find((candidate) => candidate.id === opening.segmentId)}
					{#if segment && segment.kind === 'line'}
						{@const openingStart = worldToPlanScreen(interaction.planView, segmentPointAtOffset(segment, opening.offset))}
						{@const openingEnd = worldToPlanScreen(interaction.planView, segmentPointAtOffset(segment, opening.offset + opening.width))}
						<line
							class="opening-line"
							class:opening-selected={interaction.selection.kind === 'opening' && interaction.selection.openingId === opening.id}
							x1={openingStart[0]} y1={openingStart[1]} x2={openingEnd[0]} y2={openingEnd[1]}
						/>
					{/if}
				{/each}
			{/if}
		{/each}
		{#if interaction.selection.kind === 'room' && selectedPoints.length > 0}
			{#each selectedPoints as point, index (index)}
				{@const screen = worldToPlanScreen(interaction.planView, point)}
				<circle class="vertex-handle" cx={screen[0]} cy={screen[1]} r="6" />
			{/each}
			{#each selectedPoints as point, index (index)}
				{@const next = selectedPoints[(index + 1) % selectedPoints.length]!}
				{@const start = worldToPlanScreen(interaction.planView, point)}
				{@const end = worldToPlanScreen(interaction.planView, next)}
				<text class="dimension-label" x={(start[0] + end[0]) / 2} y={(start[1] + end[1]) / 2 - 5}>{Math.hypot(next[0] - point[0], next[1] - point[1]).toFixed(2)} m</text>
			{/each}
		{/if}
		{#if draftPolygon && draftPolygon.length > 0}
			<polyline class="draft-outline" points={draftPolygon.map((point) => worldToPlanScreen(interaction.planView, point).join(',')).join(' ')} />
			{#each draftPolygon as point, index (index)}
				{@const screen = worldToPlanScreen(interaction.planView, point)}
				<circle class="draft-point" cx={screen[0]} cy={screen[1]} r="5" />
			{/each}
		{/if}
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
	.wall-line { stroke: #b2a58f; stroke-width: 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-line.selected { stroke: #fff2c7; stroke-width: 6; }
	.wall-line.opening-selected { stroke: #d6b35f; stroke-width: 6; }
	.opening-line { stroke: #77c6b0; stroke-width: 7; vector-effect: non-scaling-stroke; pointer-events: none; }
	.opening-line.opening-selected { stroke: #fff2c7; stroke-width: 9; }
	.vertex-handle { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.dimension-label, .selection-label { fill: #f1d99a; font: 10px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.selection-label { font-size: 12px; font-weight: 700; }
	.draft-outline { fill: rgba(214, 179, 95, 0.18); stroke: #d6b35f; stroke-width: 2; stroke-dasharray: 8 4; vector-effect: non-scaling-stroke; }
	.draft-point { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.scale-label { fill: #d6d0c4; font: 11px ui-monospace, monospace; }
	.scale-bar { stroke: #fff2c7; stroke-width: 3; vector-effect: non-scaling-stroke; }
	.plan-help { position: absolute; top: 0.8rem; left: 50%; z-index: 2; transform: translateX(-50%); padding: 0.45rem 0.7rem; border: 1px solid #49433a; border-radius: 999px; background: rgb(18 18 24 / 92%); color: #fff2c7; font: 600 0.7rem/1.2 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
	.plan-actions { position: absolute; right: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.4rem; }
	.plan-actions button { padding: 0.44rem 0.6rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #2a2618; color: #fff2c7; font: 600 0.7rem/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
	.plan-actions button.secondary { border-color: #4a4650; background: #1a1a22; color: #d6d0c4; }
	.plan-meta { position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.7rem; color: #a8a29a; font: 0.68rem/1 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
	.plan-meta .warning { color: #efc7c7; }
</style>
