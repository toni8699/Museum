<script lang="ts">
	import {
		buildPlanGrid,
		buildPlanRulerTicks,
		buildSegmentedScaleBar,
		type PlanViewportState
	} from './layout-plan-transform';

	/* Grid belongs under the plan model; rulers and the scale bar are
	   viewport-pinned chrome and belong over it. Mount once per layer. */
	let { planView, layer }: { planView: PlanViewportState; layer: 'grid' | 'overlay' } = $props();
	const gridLines = $derived(buildPlanGrid(planView));
	const xTicks = $derived(buildPlanRulerTicks(planView, 'x'));
	const zTicks = $derived(buildPlanRulerTicks(planView, 'z'));
	const scale = $derived(buildSegmentedScaleBar(planView.pixelsPerMeter));
	const rulerSize = 22;
	const scaleOrigin = 26;
	const scaleY = $derived(planView.height - 42);
	const cornerX = 26;
	const cornerY = $derived(planView.height - 26);
</script>

{#if layer === 'grid' && planView.gridEnabled}
	{#each gridLines as line (line.id)}
		<line class:major={line.major} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} />
	{/each}
{/if}

{#if layer === 'overlay'}
<g class="plan-rulers" aria-hidden="true">
	<rect class="ruler-strip ruler-strip-x" x="0" y="0" width={planView.width} height={rulerSize} />
	<rect class="ruler-strip ruler-strip-z" x="0" y="0" width={rulerSize} height={planView.height} />
	{#each xTicks as tick (`x-${tick.value}`)}
		<line class="ruler-tick" x1={tick.pixel} y1={rulerSize - 7} x2={tick.pixel} y2={rulerSize} />
		<text class="ruler-label" x={tick.pixel + 3} y="12">{tick.value} m</text>
	{/each}
	{#each zTicks as tick (`z-${tick.value}`)}
		<line class="ruler-tick" x1={rulerSize - 7} y1={tick.pixel} x2={rulerSize} y2={tick.pixel} />
		<text class="ruler-label ruler-label-z" x="4" y={tick.pixel - 3}>{tick.value} m</text>
	{/each}
</g>

<g class="corner-axis-key" transform={`translate(${cornerX} ${cornerY})`} aria-hidden="true">
	<line class="corner-axis-z" x1="0" y1="0" x2="0" y2="-16" />
	<path class="corner-arrow-z" d="M -3 -12 L 0 -16 L 3 -12" />
	<line class="corner-axis-x" x1="0" y1="0" x2="18" y2="0" />
	<path class="corner-arrow-x" d="M 14 -3 L 18 0 L 14 3" />
	<text class="corner-label-z" x="-4" y="-18" text-anchor="end">Z</text>
	<text class="corner-label-x" x="22" y="4">X</text>
</g>

<g class="segmented-scale" transform={`translate(${scaleOrigin} ${scaleY})`} aria-hidden="true">
	<text class="scale-label" x="0" y="-6">{scale.meters} m</text>
	{#each scale.segments as segment, index (`segment-${index}`)}
		<rect class:alternate={index % 2 === 1} class="scale-segment" x={segment.startPixel} y="0" width={segment.widthPixel} height="6" />
	{/each}
	<text class="scale-end-label" x="0" y="19">0</text>
	<text class="scale-end-label" x={scale.segments.reduce((sum, segment) => sum + segment.widthPixel, 0)} y="19" text-anchor="end">{scale.meters}</text>
</g>
{/if}

<style>
	line { stroke: var(--editor-plan-grid-minor); stroke-width: 1; vector-effect: non-scaling-stroke; }
	line.major { stroke: var(--editor-plan-grid-major); }
	.ruler-strip { fill: color-mix(in srgb, var(--editor-plan-canvas-bg) 88%, var(--editor-plan-grid-major)); opacity: 0.92; }
	.ruler-tick { stroke: var(--editor-plan-wall); }
	.ruler-label { fill: var(--editor-plan-muted); font: 10px var(--editor-font); pointer-events: none; }
	.ruler-label-z { dominant-baseline: middle; }
	.scale-label, .scale-end-label { fill: var(--editor-plan-muted); font: 10px var(--editor-font); }
	.corner-axis-z, .corner-axis-x { stroke: var(--editor-plan-muted); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
	.corner-arrow-z, .corner-arrow-x { fill: none; stroke: var(--editor-plan-muted); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
	.corner-label-z, .corner-label-x { fill: var(--editor-plan-muted); font: 10px var(--editor-font); }
	.scale-segment { fill: var(--editor-plan-wall); }
	.scale-segment.alternate { fill: var(--editor-plan-grid-major); }
</style>
