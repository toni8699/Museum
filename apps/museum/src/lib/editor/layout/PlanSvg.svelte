<script lang="ts">
	import { worldToPlanScreen, type PlanViewportState } from './layout-plan-transform';
	import type { LayoutVec2 } from '$lib/layout/layout-types';
	import type {
		PlanPolylinePrimitive,
		PlanRenderModel,
		PlanStyleToken
	} from '$lib/layout/plan-render-model';

	let {
		model,
		planView
	}: {
		model: PlanRenderModel;
		planView: PlanViewportState;
	} = $props();

	const TOKEN_CLASSES: Partial<Record<PlanStyleToken, string>> = {
		'room-fill-selected': 'room-fill selected',
		'room-outline-selected': 'room-outline selected',
		'wall-line-selected': 'wall-line selected',
		'wall-line-opening-selected': 'wall-line opening-selected',
		'opening-line-selected': 'opening-line opening-selected',
		'scene-footprint-bridge-hover': 'scene-footprint bridge-hover',
		'scene-footprint-active': 'scene-footprint active',
		'scene-footprint-selected': 'scene-footprint selected',
		'layout-object-readonly': 'layout-object readonly',
		'layout-object-selected': 'layout-object selected',
		'layout-object-readonly-selected': 'layout-object readonly selected',
		// P3.3 — Arrange hover bridge-affordance outline.
		'arrange-hover': 'arrange-hover',
		'interior-anchor-selected': 'interior-anchor selected',
		'primitive-ghost-circle': 'primitive-ghost circle',
		'primitive-ghost-sphere': 'primitive-ghost sphere',
		'primitive-ghost-invalid': 'primitive-ghost invalid',
		// P1.5 — Camera Plan authoring tokens.
		'camera-edge': 'camera-edge',
		'camera-edge-selected': 'camera-edge selected',
		'camera-edge-hovered': 'camera-edge hovered',
		'camera-edge-retained': 'camera-edge retained',
		'camera-edge-retained-selected': 'camera-edge retained selected',
		'camera-edge-retained-hovered': 'camera-edge retained hovered',
		'camera-node': 'camera-node',
		'camera-node-selected': 'camera-node selected',
		'camera-node-hovered': 'camera-node hovered',
		'camera-node-free': 'camera-node free',
		'camera-unsequenced-badge': 'camera-unsequenced-badge',
		'camera-anchor': 'camera-anchor',
		'camera-anchor-selected': 'camera-anchor selected',
		'camera-anchor-hovered': 'camera-anchor hovered',
		'camera-order-label': 'camera-order-label',
		'camera-timing-label': 'camera-timing-label',
		'camera-connect-band': 'camera-connect-band',
		'camera-placement-ghost': 'camera-placement-ghost',
		'camera-placement-ghost-invalid': 'camera-placement-ghost invalid'
	};

	function tokenClass(style: PlanStyleToken): string {
		return TOKEN_CLASSES[style] ?? style;
	}

	function pointsAttr(points: readonly LayoutVec2[]): string {
		return points.map((point) => worldToPlanScreen(planView, point).join(',')).join(' ');
	}

	function polylinePointsAttr(points: readonly LayoutVec2[], endOffsetPx?: readonly [number, number]): string {
		const screen = points.map((point) => worldToPlanScreen(planView, point));
		if (endOffsetPx && screen.length > 0) {
			const last = screen[screen.length - 1]!;
			screen[screen.length - 1] = [last[0] + endOffsetPx[0], last[1] + endOffsetPx[1]];
		}
		return screen.map((point) => point.join(',')).join(' ');
	}

	function architecturalStrokeStyle(primitive: PlanPolylinePrimitive): string {
		const thickness = primitive.architecture?.kind === 'wall'
			? primitive.architecture.thicknessMeters
			: primitive.architecture?.wallThicknessMeters;
		const width = Math.max(7, (thickness ?? 0.2) * planView.pixelsPerMeter);
		return `--architecture-width: ${width}px;`;
	}

	function wallStateClass(style: PlanStyleToken): string {
		if (style === 'wall-line-selected') return 'selected';
		if (style === 'wall-line-opening-selected') return 'opening-selected';
		return '';
	}

	function openingSelected(style: PlanStyleToken): boolean {
		return style === 'opening-line-selected';
	}

	type OpeningSymbol = {
		span: LayoutVec2[];
		jambStart: LayoutVec2[];
		jambEnd: LayoutVec2[];
		doorLeaf?: LayoutVec2[];
		doorSwing?: LayoutVec2[];
		windowFrames?: LayoutVec2[][];
	};

	function openingSymbol(primitive: PlanPolylinePrimitive): OpeningSymbol | null {
		const architecture = primitive.architecture;
		if (!architecture || architecture.kind === 'wall' || primitive.points.length < 2) return null;
		const start = primitive.points[0]!;
		const end = primitive.points.at(-1)!;
		const normal = architecture.inwardNormal;
		const halfWall = architecture.wallThicknessMeters / 2;
		const jamb = (point: LayoutVec2): LayoutVec2[] => [
			[point[0] - normal[0] * halfWall, point[1] - normal[1] * halfWall],
			[point[0] + normal[0] * halfWall, point[1] + normal[1] * halfWall]
		];
		const symbol: OpeningSymbol = {
			span: primitive.points,
			jambStart: jamb(start),
			jambEnd: jamb(end)
		};

		if (architecture.kind === 'window') {
			const offsets = [-0.28, 0, 0.28].map((ratio) => ratio * architecture.wallThicknessMeters);
			symbol.windowFrames = offsets.map((offset) => primitive.points.map((point) => [
				point[0] + normal[0] * offset,
				point[1] + normal[1] * offset
			] as LayoutVec2));
			return symbol;
		}

		const leafEnd: LayoutVec2 = [
			start[0] + normal[0] * architecture.widthMeters,
			start[1] + normal[1] * architecture.widthMeters
		];
		symbol.doorLeaf = [start, leafEnd];
		const startAngle = Math.atan2(leafEnd[1] - start[1], leafEnd[0] - start[0]);
		const endAngle = Math.atan2(end[1] - start[1], end[0] - start[0]);
		let delta = endAngle - startAngle;
		while (delta > Math.PI) delta -= Math.PI * 2;
		while (delta < -Math.PI) delta += Math.PI * 2;
		const radius = Math.max(0.01, Math.hypot(end[0] - start[0], end[1] - start[1]));
		symbol.doorSwing = Array.from({ length: 13 }, (_, index) => {
			const angle = startAngle + delta * (index / 12);
			return [
				start[0] + Math.cos(angle) * radius,
				start[1] + Math.sin(angle) * radius
			] as LayoutVec2;
		});
		return symbol;
	}

	function screenAt(point: LayoutVec2, offsetPx?: readonly [number, number]): LayoutVec2 {
		const screen = worldToPlanScreen(planView, point);
		return [screen[0] + (offsetPx?.[0] ?? 0), screen[1] + (offsetPx?.[1] ?? 0)];
	}
</script>

<g class="plan-model">
	{#each model.layers as layer (layer.order)}
		{#each layer.primitives as primitive (primitive.key)}
			{#if primitive.kind === 'polygon'}
				<polygon class={tokenClass(primitive.style)} points={pointsAttr(primitive.points)} />
			{:else if primitive.kind === 'polyline'}
				{#if primitive.architecture?.kind === 'wall'}
					<polyline
						class={`wall-casing ${wallStateClass(primitive.style)}`}
						points={polylinePointsAttr(primitive.points, primitive.endOffsetPx)}
						style={architecturalStrokeStyle(primitive)}
					/>
					<polyline
						class={tokenClass(primitive.style)}
						points={polylinePointsAttr(primitive.points, primitive.endOffsetPx)}
						style={architecturalStrokeStyle(primitive)}
					/>
				{:else if primitive.architecture?.kind === 'door' || primitive.architecture?.kind === 'window'}
					{@const symbol = openingSymbol(primitive)}
					{#if symbol}
						<polyline
							class="opening-void"
							class:selected={openingSelected(primitive.style)}
							points={pointsAttr(symbol.span)}
							style={architecturalStrokeStyle(primitive)}
						/>
						<polyline class="opening-jamb" class:selected={openingSelected(primitive.style)} points={pointsAttr(symbol.jambStart)} />
						<polyline class="opening-jamb" class:selected={openingSelected(primitive.style)} points={pointsAttr(symbol.jambEnd)} />
						{#if symbol.windowFrames}
							{#each symbol.windowFrames as frame, index (`${primitive.key}:window-frame:${index}`)}
								<polyline class="window-frame" class:selected={openingSelected(primitive.style)} points={pointsAttr(frame)} />
							{/each}
						{:else if symbol.doorLeaf && symbol.doorSwing}
							<polyline class="door-threshold" points={pointsAttr(symbol.span)} />
							<polyline class="door-leaf" class:selected={openingSelected(primitive.style)} points={pointsAttr(symbol.doorLeaf)} />
							<polyline class="door-swing" class:selected={openingSelected(primitive.style)} points={pointsAttr(symbol.doorSwing)} />
						{/if}
					{/if}
				{:else}
					<polyline class={tokenClass(primitive.style)} points={polylinePointsAttr(primitive.points, primitive.endOffsetPx)} />
				{/if}
			{:else if primitive.kind === 'circle'}
				{@const screen = screenAt(primitive.center, primitive.offsetPx)}
				<circle class={tokenClass(primitive.style)} cx={screen[0]} cy={screen[1]} r={primitive.radiusPx} />
			{:else}
				{@const screen = screenAt(primitive.anchor, primitive.offsetPx)}
				<text class={tokenClass(primitive.style)} x={screen[0]} y={screen[1]}>{primitive.text}</text>
			{/if}
		{/each}
	{/each}
</g>

<style>
	/* P3.2/P3.3 — canonical §9 paper palette + ONE selection language:
	   blue `--editor-plan-selection` for every owner (rooms, walls, openings,
	   layout objects, scene entities); context/read-only stays muted. */
	.room-fill { fill: var(--editor-plan-room-bg); fill-opacity: 1; }
	.room-fill.selected { fill: var(--editor-plan-room-selected-bg); fill-opacity: 1; }
	.room-outline { fill: none; stroke: var(--editor-plan-wall); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.room-outline.selected { stroke: var(--editor-plan-selection); stroke-width: 3; }
	.scene-footprint { fill: rgb(146 144 138 / 12%); stroke: var(--editor-plan-muted); stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.scene-footprint.active { fill: rgb(47 140 255 / 10%); stroke: var(--editor-plan-hover-stroke); stroke-width: 2; }
	.scene-footprint.bridge-hover { fill: rgb(47 140 255 / 16%); stroke: var(--editor-plan-hover-stroke); stroke-width: 2.5; }
	.scene-footprint.selected { fill: rgb(47 140 255 / 24%); stroke: var(--editor-plan-selection); stroke-width: 3; }
	.selection-bounds { fill: none; stroke: var(--editor-plan-selection); stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-casing,
	.wall-line,
	.opening-void,
	.opening-jamb,
	.window-frame,
	.door-threshold,
	.door-leaf,
	.door-swing { fill: none; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-casing { stroke: var(--editor-plan-wall); stroke-width: calc(var(--architecture-width) + 2px); stroke-linecap: square; stroke-linejoin: miter; }
	.wall-casing.selected { stroke: var(--editor-plan-selection); stroke-width: calc(var(--architecture-width) + 4px); }
	.wall-casing.opening-selected { stroke: var(--editor-plan-hover-stroke); }
	.wall-line { stroke: var(--editor-plan-wall-fill); stroke-width: var(--architecture-width); stroke-linecap: square; stroke-linejoin: miter; }
	.wall-line.selected { stroke: color-mix(in srgb, var(--editor-plan-selection) 42%, var(--editor-plan-wall-fill)); }
	.wall-line.opening-selected { stroke: color-mix(in srgb, var(--editor-plan-hover-stroke) 34%, var(--editor-plan-wall-fill)); }
	.opening-void { stroke: var(--editor-plan-room-bg); stroke-width: calc(var(--architecture-width) + 4px); }
	.opening-void.selected { stroke: color-mix(in srgb, var(--editor-plan-selection) 14%, var(--editor-plan-room-bg)); }
	.opening-jamb { stroke: var(--editor-plan-wall); stroke-width: 2; }
	.window-frame { stroke: var(--editor-plan-wall); stroke-width: 1.35; }
	.door-threshold { stroke: var(--editor-plan-object-stroke); stroke-width: 1; }
	.door-leaf { stroke: var(--editor-plan-wall); stroke-width: 2.25; }
	.door-swing { stroke: var(--editor-plan-muted); stroke-width: 1.15; stroke-dasharray: 4 3; }
	.opening-jamb.selected,
	.window-frame.selected,
	.door-leaf.selected,
	.door-swing.selected { stroke: var(--editor-plan-selection); }
	/* Fallback for renderer-neutral projections without architecture metadata. */
	.opening-line { stroke: var(--editor-plan-object); stroke-width: 7; vector-effect: non-scaling-stroke; pointer-events: none; }
	.opening-line.opening-selected { stroke: var(--editor-plan-selection); stroke-width: 9; }
	.layout-object { fill: var(--editor-plan-object-fill); stroke: var(--editor-plan-object-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
	.layout-object.selected { fill: rgb(47 140 255 / 24%); stroke: var(--editor-plan-selection); stroke-width: 3; }
	.layout-object.readonly { fill: var(--editor-plan-readonly-fill); stroke-dasharray: 5 3; }
	/* P3.3 — Arrange hover outline (presentation-only, never looks selected). */
	.arrange-hover { fill: rgb(47 140 255 / 8%); stroke: var(--editor-plan-hover-stroke); stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.camera-path { fill: none; stroke: var(--editor-camera-edge-stroke); stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.view-cone { fill: rgb(47 140 255 / 8%); stroke: var(--editor-camera-edge-stroke); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
	.look-target { fill: var(--editor-camera-node-stroke); stroke: var(--editor-plan-label); stroke-width: 1; pointer-events: none; }
	.portal-crossing { fill: var(--editor-plan-object); stroke: var(--editor-plan-wall); stroke-width: 1; pointer-events: none; }
	.collision-warning { fill: rgb(239 98 108 / 30%); stroke: var(--editor-danger); stroke-width: 1; pointer-events: none; }
	.timing-label { fill: var(--editor-plan-label); font: 10px var(--editor-font); font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--editor-plan-canvas-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	/* P1.5 — Camera Plan authoring styles (live camera-graph overlay). */
	.camera-edge { fill: none; stroke: var(--editor-camera-edge-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.camera-edge.selected { stroke: var(--editor-plan-selection); stroke-width: 3.5; }
	.camera-edge.hovered { stroke: var(--editor-plan-hover-stroke); stroke-width: 3; }
	.camera-edge.retained { stroke: var(--editor-plan-muted); stroke-width: 2; stroke-dasharray: 5 4; }
	/* P3B.6 — retained identity stays dashed/desaturated while state feedback
	   remains visible. */
	.camera-edge.retained.selected { stroke: color-mix(in srgb, var(--editor-plan-selection) 48%, var(--editor-plan-muted)); stroke-width: 3.5; stroke-dasharray: 5 4; }
	.camera-edge.retained.hovered { stroke: color-mix(in srgb, var(--editor-plan-hover-stroke) 42%, var(--editor-plan-muted)); stroke-width: 3; stroke-dasharray: 5 4; }
	.camera-node { fill: var(--editor-camera-node-fill); stroke: var(--editor-camera-node-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.camera-node.selected { fill: var(--editor-accent); stroke: var(--editor-text-primary); stroke-width: 3; }
	.camera-node.hovered { fill: var(--editor-accent-hover); stroke: var(--editor-text-primary); stroke-width: 3; }
	.camera-node.free { fill: var(--editor-plan-canvas-bg); stroke: var(--editor-camera-unsequenced-ring); stroke-width: 2; stroke-dasharray: none; }
	.camera-unsequenced-badge { fill: none; stroke: var(--editor-camera-unsequenced-ring); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.camera-anchor { fill: var(--editor-accent); stroke: var(--editor-text-primary); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.camera-anchor.selected { fill: var(--editor-text-primary); stroke: var(--editor-accent-pressed); stroke-width: 2.5; }
	.camera-anchor.hovered { fill: var(--editor-accent-hover); stroke: var(--editor-text-primary); stroke-width: 2.5; }
	.camera-order-label { fill: var(--editor-text-primary); font: 700 11px var(--editor-font); text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: var(--editor-accent-pressed); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.camera-timing-label { fill: var(--editor-plan-label); font: 10px var(--editor-font); font-variant-numeric: tabular-nums; text-anchor: middle; paint-order: stroke; stroke: var(--editor-plan-canvas-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.camera-connect-band { fill: none; stroke: var(--editor-plan-selection); stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.camera-placement-ghost { fill: var(--editor-accent-soft); stroke: var(--editor-plan-selection); stroke-width: 2; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.camera-placement-ghost.invalid { fill: rgb(239 98 108 / 20%); stroke: var(--editor-danger); }
	.primitive-ghost { fill: rgb(47 140 255 / 18%); stroke: var(--editor-plan-selection); stroke-width: 2; stroke-dasharray: 7 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.primitive-ghost.circle { fill: rgb(49 201 133 / 18%); stroke: var(--editor-success); }
	.primitive-ghost.sphere { fill: rgb(140 124 243 / 18%); stroke: var(--editor-timeline-look); }
	.primitive-ghost.invalid { fill: rgb(239 98 108 / 22%); stroke: var(--editor-danger); }
	.interior-anchor { fill: var(--editor-accent); stroke: var(--editor-text-primary); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.interior-anchor.selected { fill: var(--editor-text-primary); stroke: var(--editor-accent-pressed); }
	.vertex-handle { fill: var(--editor-plan-handle-fill); stroke: var(--editor-plan-handle-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; }
	.rotation-arm { fill: none; stroke: var(--editor-accent-pressed); stroke-width: 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.rotation-handle { fill: var(--editor-plan-handle-fill); stroke: var(--editor-plan-handle-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
	.rotation-feedback { fill: var(--editor-plan-label); font: 700 11px var(--editor-font); font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--editor-plan-canvas-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; user-select: none; }
	.dimension-label { fill: var(--editor-plan-muted); font: 10px var(--editor-font); font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--editor-plan-canvas-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.draft-outline { fill: rgb(47 140 255 / 10%); stroke: var(--editor-plan-selection); stroke-width: 2; stroke-dasharray: 8 4; vector-effect: non-scaling-stroke; }
	.draft-point { fill: var(--editor-plan-handle-fill); stroke: var(--editor-plan-handle-stroke); stroke-width: 2; vector-effect: non-scaling-stroke; }
</style>
