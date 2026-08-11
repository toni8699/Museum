<script lang="ts">
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import {
		addPolygonPoint,
		beginRectangle,
		clearLayoutDraft,
		rectanglePoints,
		updateRectangle,
		type LayoutInteractionState
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import type { LayoutVec2 } from './layout-types';

	let {
		model,
		preview,
		interaction,
		onCommit
	}: {
		model: LayoutPreviewModel;
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
		onCommit: (points: LayoutVec2[]) => void;
	} = $props();

	let svgElement = $state<SVGSVGElement>();
	let pointerId = $state<number | null>(null);

	const worldBounds = $derived.by(() => {
		const points: LayoutVec2[] = [
			...model.rooms.flatMap((room) => room.floorPolygon),
			...interaction.polygonPoints,
			...(rectanglePoints(interaction) ?? [])
		];
		if (points.length === 0) return { minX: -8, minZ: -6, width: 16, height: 12 };

		const minX = Math.min(...points.map(([x]) => x));
		const maxX = Math.max(...points.map(([x]) => x));
		const minZ = Math.min(...points.map(([, z]) => z));
		const maxZ = Math.max(...points.map(([, z]) => z));
		const padding = Math.max(1, Math.max(maxX - minX, maxZ - minZ) * 0.12);
		return {
			minX: minX - padding,
			minZ: minZ - padding,
			width: Math.max(4, maxX - minX + padding * 2),
			height: Math.max(4, maxZ - minZ + padding * 2)
		};
	});

	const viewBox = $derived(
		`${worldBounds.minX} ${worldBounds.minZ} ${worldBounds.width} ${worldBounds.height}`
	);
	const draftPolygon = $derived(
		interaction.tool === 'rectangle'
			? rectanglePoints(interaction)
			: interaction.polygonPoints
	);

	function worldPoint(event: PointerEvent): LayoutVec2 | null {
		const svg = svgElement;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		return [
			worldBounds.minX + ((event.clientX - rect.left) / rect.width) * worldBounds.width,
			worldBounds.minZ + ((event.clientY - rect.top) / rect.height) * worldBounds.height
		];
	}

	function onPointerDown(event: PointerEvent) {
		if (interaction.tool !== 'rectangle') return;
		const point = worldPoint(event);
		if (!point || !svgElement) return;
		pointerId = event.pointerId;
		svgElement.setPointerCapture(event.pointerId);
		beginRectangle(interaction, point);
	}

	function onPointerMove(event: PointerEvent) {
		if (interaction.tool !== 'rectangle' || pointerId !== event.pointerId) return;
		const point = worldPoint(event);
		if (point) updateRectangle(interaction, point);
	}

	function onPointerUp(event: PointerEvent) {
		if (interaction.tool !== 'rectangle' || pointerId !== event.pointerId) return;
		const points = rectanglePoints(interaction);
		pointerId = null;
		svgElement?.releasePointerCapture(event.pointerId);
		if (points) onCommit(points);
		clearLayoutDraft(interaction);
	}

	function onClick(event: MouseEvent) {
		if (interaction.tool !== 'polygon') return;
		const point = worldPoint(event as unknown as PointerEvent);
		if (!point) return;
		const first = interaction.polygonPoints[0];
		const closeDistance = Math.max(worldBounds.width, worldBounds.height) * 0.025;
		if (first && interaction.polygonPoints.length >= 3 && distance(first, point) <= closeDistance) {
			onCommit([...interaction.polygonPoints]);
			clearLayoutDraft(interaction);
			return;
		}
		addPolygonPoint(interaction, point);
	}

	function finishPolygon() {
		if (interaction.polygonPoints.length < 3) return;
		onCommit([...interaction.polygonPoints]);
		clearLayoutDraft(interaction);
	}

	function cancelDraft() {
		clearLayoutDraft(interaction);
	}

	function distance(a: LayoutVec2, b: LayoutVec2): number {
		return Math.hypot(a[0] - b[0], a[1] - b[1]);
	}
</script>

<div class="plan-viewport" aria-label="Layout Plan drafting viewport">
	<div class="plan-help" role="status">
		{#if interaction.tool === 'rectangle'}
			Drag to draw a rectangle · Escape cancels
		{:else if interaction.tool === 'polygon'}
			Click points · click the first point or Finish to close · Escape cancels
		{:else}
			Select a drafting tool to begin
		{/if}
	</div>
	<svg
		bind:this={svgElement}
		class="plan-canvas"
		viewBox={viewBox}
		preserveAspectRatio="none"
		role="application"
		aria-label="2D layout plan"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onclick={onClick}
	>
		<defs>
			<pattern id="layout-grid" width="1" height="1" patternUnits="userSpaceOnUse">
				<path d="M 1 0 L 0 0 0 1" fill="none" stroke="#302d28" stroke-width="0.018" />
			</pattern>
		</defs>
		<rect x={worldBounds.minX} y={worldBounds.minZ} width={worldBounds.width} height={worldBounds.height} fill="url(#layout-grid)" />
		{#each model.rooms as room (room.roomId)}
			<polygon
				class="room-fill"
				points={room.floorPolygon.map(([x, z]) => `${x},${z}`).join(' ')}
				aria-label={`Room ${room.roomId}`}
			/>
			<polyline
				class="room-outline"
				points={[...room.floorPolygon, room.floorPolygon[0]].map(([x, z]) => `${x},${z}`).join(' ')}
			/>
		{/each}
		{#if draftPolygon && draftPolygon.length > 0}
			<polyline
				class="draft-outline"
				points={draftPolygon.map(([x, z]) => `${x},${z}`).join(' ')}
			/>
			{#each draftPolygon as point, index (index)}
				<circle class="draft-point" cx={point[0]} cy={point[1]} r={Math.max(worldBounds.width, worldBounds.height) * 0.012} />
			{/each}
		{/if}
	</svg>
	<div class="plan-actions">
		{#if interaction.tool === 'polygon' && interaction.polygonPoints.length >= 3}
			<button type="button" onclick={finishPolygon}>Finish polygon</button>
		{/if}
		{#if draftPolygon && draftPolygon.length > 0}
			<button type="button" class="secondary" onclick={cancelDraft}>Cancel draft</button>
		{/if}
	</div>
	<div class="plan-meta">
		<span>{preview.model.rooms.length} rooms</span>
		<span>{preview.issues.length} geometry warnings</span>
	</div>
</div>

<style>
	.plan-viewport { position: absolute; inset: 0; background: #0d0d12; }
	.plan-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
	.room-fill { fill: #6b6254; fill-opacity: 0.32; }
	.room-outline { fill: none; stroke: #88b7d6; stroke-width: 0.07; vector-effect: non-scaling-stroke; }
	.draft-outline { fill: rgba(214, 179, 95, 0.18); stroke: #d6b35f; stroke-width: 0.1; stroke-dasharray: 0.35 0.18; vector-effect: non-scaling-stroke; }
	.draft-point { fill: #fff2c7; stroke: #d6b35f; stroke-width: 0.05; vector-effect: non-scaling-stroke; }
	.plan-help { position: absolute; top: 0.8rem; left: 50%; z-index: 2; transform: translateX(-50%); padding: 0.45rem 0.7rem; border: 1px solid #49433a; border-radius: 999px; background: rgb(18 18 24 / 92%); color: #fff2c7; font: 600 0.7rem/1.2 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
	.plan-actions { position: absolute; right: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.4rem; }
	.plan-actions button { padding: 0.44rem 0.6rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #2a2618; color: #fff2c7; font: 600 0.7rem/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
	.plan-actions button.secondary { border-color: #4a4650; background: #1a1a22; color: #d6d0c4; }
	.plan-meta { position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.7rem; color: #a8a29a; font: 0.68rem/1 ui-sans-serif, system-ui, sans-serif; pointer-events: none; }
</style>
