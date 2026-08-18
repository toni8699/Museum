<script lang="ts">
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';

	// S10.1.7 — non-interactive RGB XYZ indicator pinned to the viewport corner.
	// Pure display: reads the canvas-side frame state, never intercepts pointer
	// events, never raycasts.
	const AXIS_COLOR = {
		x: '#ef5b5b',
		y: '#62c96b',
		z: '#5a8cff'
	} as const;
	type AxisKey = keyof typeof AXIS_COLOR;
	const CENTER = 30;
	const LENGTH = 22;
	const LABEL_OFFSET = 6;

	const axes = $derived([
		{ key: 'x' as AxisKey, ...editorOrientationGizmo.x },
		{ key: 'y' as AxisKey, ...editorOrientationGizmo.y },
		{ key: 'z' as AxisKey, ...editorOrientationGizmo.z }
	]);

	function endpoint(axis: { x: number; y: number }) {
		const endX = CENTER + axis.x * LENGTH;
		const endY = CENTER + axis.y * LENGTH;
		return { endX, endY };
	}

	function labelPoint(axis: { x: number; y: number }) {
		const { endX, endY } = endpoint(axis);
		return { x: endX + axis.x * LABEL_OFFSET, y: endY + axis.y * LABEL_OFFSET };
	}
</script>

{#if editorOrientationGizmo.ready}
	<div class="orientation" aria-hidden="true">
		<svg viewBox="0 0 60 60" width="60" height="60">
			{#each axes as axis (axis.key)}
				{@const { endX, endY } = endpoint(axis)}
				{@const label = labelPoint(axis)}
				<line
					x1={CENTER}
					y1={CENTER}
					x2={endX}
					y2={endY}
					stroke={AXIS_COLOR[axis.key]}
					stroke-width="2"
					stroke-linecap="round"
					opacity={0.25 + 0.75 * axis.visibility}
				/>
				<text
					x={label.x}
					y={label.y}
					fill={AXIS_COLOR[axis.key]}
					font-size="11"
					font-weight="700"
					font-family="ui-sans-serif, system-ui, sans-serif"
					text-anchor="middle"
					dominant-baseline="middle"
					opacity={0.3 + 0.7 * axis.visibility}
				>
					{axis.key.toUpperCase()}
				</text>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.orientation {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		z-index: 4;
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		border: 1px solid rgb(70 68 78 / 88%);
		border-radius: 0.42rem;
		background: rgb(19 19 26 / 88%);
		box-shadow: 0 0.4rem 1.25rem rgb(0 0 0 / 28%);
		backdrop-filter: blur(8px);
		pointer-events: none;
	}
</style>
