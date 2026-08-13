<script lang="ts">
	import { worldToPlanScreen, type PlanViewportState } from './layout-plan-transform';
	import type { LayoutVec2 } from './layout-types';
	import type { PlanRenderModel, PlanStyleToken } from '$lib/layout/plan-render-model';

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
		'layout-object-readonly': 'layout-object readonly',
		'layout-object-selected': 'layout-object selected',
		'layout-object-readonly-selected': 'layout-object readonly selected',
		'interior-anchor-selected': 'interior-anchor selected',
		'primitive-ghost-circle': 'primitive-ghost circle',
		'primitive-ghost-sphere': 'primitive-ghost sphere',
		'primitive-ghost-invalid': 'primitive-ghost invalid'
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
				<polyline class={tokenClass(primitive.style)} points={polylinePointsAttr(primitive.points, primitive.endOffsetPx)} />
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
	.room-fill { fill: #6b6254; fill-opacity: 0.32; }
	.room-fill.selected { fill: #9b7841; fill-opacity: 0.45; }
	.room-outline { fill: none; stroke: #88b7d6; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.room-outline.selected { stroke: #f1cd78; stroke-width: 3; }
	.selection-bounds { fill: none; stroke: #f1cd78; stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-line { fill: none; stroke: #b2a58f; stroke-width: 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.wall-line.selected { stroke: #fff2c7; stroke-width: 6; }
	.wall-line.opening-selected { stroke: #d6b35f; stroke-width: 6; }
	.opening-line { stroke: #77c6b0; stroke-width: 7; vector-effect: non-scaling-stroke; pointer-events: none; }
	.opening-line.opening-selected { stroke: #fff2c7; stroke-width: 9; }
	.layout-object { fill: #73806d; fill-opacity: 0.62; stroke: #b7c4ae; stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
	.layout-object.selected { fill: #9b7841; stroke: #fff2c7; stroke-width: 3; }
	.layout-object.readonly { fill: #6b6576; stroke-dasharray: 5 3; }
	.camera-path { fill: none; stroke: #9bd8ff; stroke-width: 2; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.view-cone { fill: rgba(155, 216, 255, 0.12); stroke: #9bd8ff; stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
	.look-target { fill: #d6b35f; stroke: #fff2c7; stroke-width: 1; pointer-events: none; }
	.portal-crossing { fill: #77c6b0; stroke: #b8f0de; stroke-width: 1; pointer-events: none; }
	.collision-warning { fill: #d96b6b; stroke: #efc7c7; stroke-width: 1; pointer-events: none; }
	.timing-label { fill: #9bd8ff; font: 10px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.primitive-ghost { fill: #d6b35f; fill-opacity: 0.25; stroke: #f1d99a; stroke-width: 2; stroke-dasharray: 7 4; vector-effect: non-scaling-stroke; pointer-events: none; }
	.primitive-ghost.circle { fill: #77c6b0; stroke: #b8f0de; }
	.primitive-ghost.sphere { fill: #aa8ed4; stroke: #e0cfff; }
	.primitive-ghost.invalid { fill: #d96b6b; stroke: #efc7c7; }
	.interior-anchor { fill: #d6b35f; stroke: #fff2c7; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.interior-anchor.selected { fill: #fff2c7; stroke: #d6b35f; }
	.vertex-handle { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.rotation-arm { fill: none; stroke: #ffffff; stroke-width: 3; vector-effect: non-scaling-stroke; pointer-events: none; }
	.rotation-handle { fill: #fff2c7; stroke: #6f5a2f; stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
	.rotation-feedback { fill: #fff2c7; font: 700 11px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; user-select: none; }
	.dimension-label { fill: #f1d99a; font: 10px ui-monospace, monospace; paint-order: stroke; stroke: #0d0d12; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.draft-outline { fill: rgba(214, 179, 95, 0.18); stroke: #d6b35f; stroke-width: 2; stroke-dasharray: 8 4; vector-effect: non-scaling-stroke; }
	.draft-point { fill: #fff2c7; stroke: #d6b35f; stroke-width: 2; vector-effect: non-scaling-stroke; }
</style>
