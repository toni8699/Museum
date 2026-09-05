<script lang="ts">
	import { worldToPlanScreen, type PlanViewportState } from './layout-plan-transform';

	let { planView }: { planView: PlanViewportState } = $props();

	// P21.2 ghost blueprint: 10m × 8m dashed rect centered at world origin.
	const corners = $derived.by(() => {
		const topLeft = worldToPlanScreen(planView, [-5, -4]);
		const bottomRight = worldToPlanScreen(planView, [5, 4]);
		return {
			x: Math.min(topLeft[0], bottomRight[0]),
			y: Math.min(topLeft[1], bottomRight[1]),
			width: Math.abs(bottomRight[0] - topLeft[0]),
			height: Math.abs(bottomRight[1] - topLeft[1]),
			center: worldToPlanScreen(planView, [0, 0])
		};
	});
</script>

<g class="plan-empty-ghost" aria-hidden="true">
	<rect
		class="ghost-rect"
		x={corners.x}
		y={corners.y}
		width={corners.width}
		height={corners.height}
	/>
	<text class="ghost-title" x={corners.center[0]} y={corners.center[1] - 14} text-anchor="middle"
		>DRAW YOUR FIRST ROOM</text
	>
	<text class="ghost-subtitle" x={corners.center[0]} y={corners.center[1] + 6} text-anchor="middle"
		>Use Rectangle Room or Polygon Room in the toolbar above ↑</text
	>
	<text class="ghost-dims" x={corners.center[0]} y={corners.center[1] + 26} text-anchor="middle"
		>10.0m × 8.0m</text
	>
</g>

<style>
	.plan-empty-ghost {
		pointer-events: none;
	}
	.ghost-rect {
		fill: none;
		stroke: #64748b;
		stroke-opacity: 0.2;
		stroke-width: 2;
		stroke-dasharray: 10 7;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.ghost-title,
	.ghost-subtitle,
	.ghost-dims {
		pointer-events: none;
		font-family: var(--editor-font);
		paint-order: stroke;
		stroke: var(--editor-plan-canvas-bg);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.ghost-title {
		fill: var(--editor-plan-muted);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
	}
	.ghost-subtitle {
		fill: var(--editor-plan-muted);
		font-size: 11px;
		font-weight: 500;
	}
	.ghost-dims {
		fill: var(--editor-plan-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
</style>
