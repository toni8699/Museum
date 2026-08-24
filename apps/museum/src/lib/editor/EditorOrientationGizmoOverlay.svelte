<script lang="ts">
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';

	// P3.2 — canonical upper-right XYZ orientation box (Design-specs §28A).
	// Custom viewport utility, not a toolbar control and not the selected-
	// object gizmo: it always shows the *viewed* world orientation read from
	// the canvas-side frame state. Still pure display in P3 (no input
	// contract — click-to-snap is P3B); pointer events stay off.
	//
	// The frame state provides the orbit camera's world-axis basis projected
	// into screen space, so a unit cube's corners project as
	// `a·x̂ + b·ŷ + c·ẑ` — the wire cube below rotates live with the camera.
	type AxisKey = 'x' | 'y' | 'z';
	const AXIS_KEYS: readonly AxisKey[] = ['x', 'y', 'z'];

	const CENTER = 44;
	/** Half-edge of the projected unit cube, in box pixels. */
	const HALF_EDGE = 13;
	/** Axis shaft length beyond the cube, in box pixels. */
	const SHAFT = 21;
	const LABEL_GAP = 9;

	const axes = $derived({
		x: { ...editorOrientationGizmo.x },
		y: { ...editorOrientationGizmo.y },
		z: { ...editorOrientationGizmo.z }
	});

	function project(a: number, b: number, c: number): [number, number] {
		return [
			CENTER + a * axes.x.x * HALF_EDGE + b * axes.y.x * HALF_EDGE + c * axes.z.x * HALF_EDGE,
			CENTER + a * axes.x.y * HALF_EDGE + b * axes.y.y * HALF_EDGE + c * axes.z.y * HALF_EDGE
		];
	}

	/** The 12 cube edges as corner pairs differing in exactly one basis coord. */
	const cubeEdges = $derived.by(() => {
		if (!editorOrientationGizmo.ready) return [];
		const corners: Array<{ key: string; p: [number, number]; depth: number }> = [];
		for (const a of [-1, 1])
			for (const b of [-1, 1])
				for (const c of [-1, 1]) {
					corners.push({
						key: `${a}${b}${c}`,
						p: project(a, b, c),
						depth: a * axes.x.visibility + b * axes.y.visibility + c * axes.z.visibility
					});
				}
		const edges: Array<[string, string]> = [];
		for (const from of corners) {
			for (const to of corners) {
				if (from.key >= to.key) continue;
				const delta =
					Math.abs(Number(from.key[0]) - Number(to.key[0])) +
					Math.abs(Number(from.key[1]) - Number(to.key[1])) +
					Math.abs(Number(from.key[2]) - Number(to.key[2]));
				if (delta === 2) edges.push([from.key, to.key]);
			}
		}
		return edges.map(([fromKey, toKey]) => {
			const from = corners.find((corner) => corner.key === fromKey)!;
			const to = corners.find((corner) => corner.key === toKey)!;
			return { x1: from.p[0], y1: from.p[1], x2: to.p[0], y2: to.p[1] };
		});
	});

	const axisShafts = $derived.by(() => {
		if (!editorOrientationGizmo.ready) return [];
		return AXIS_KEYS.map((key) => {
			const axis = axes[key];
			const endX = CENTER + axis.x * SHAFT;
			const endY = CENTER + axis.y * SHAFT;
			return {
				key,
				endX,
				endY,
				labelX: endX + axis.x * LABEL_GAP,
				labelY: endY + axis.y * LABEL_GAP,
				strength: 0.35 + 0.65 * axis.visibility
			};
		});
	});
</script>

{#if editorOrientationGizmo.ready}
	<div class="orientation" aria-hidden="true">
		<svg viewBox="0 0 88 88" width="88" height="88">
			<g class="cube">
				{#each cubeEdges as edge, index (index)}
					<line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
				{/each}
			</g>
			{#each axisShafts as axis (axis.key)}
				<line
					class="shaft shaft--{axis.key}"
					x1={CENTER}
					y1={CENTER}
					x2={axis.endX}
					y2={axis.endY}
					opacity={axis.strength}
				/>
				<text
					class="label label--{axis.key}"
					x={axis.labelX}
					y={axis.labelY}
					text-anchor="middle"
					dominant-baseline="middle"
					opacity={axis.strength}
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
		top: var(--editor-orientation-inset-top);
		right: var(--editor-orientation-inset-right);
		z-index: 4;
		display: grid;
		place-items: center;
		width: var(--editor-orientation-size);
		height: var(--editor-orientation-size);
		border: 1px solid var(--editor-orientation-border);
		border-radius: var(--editor-radius-md);
		background: var(--editor-orientation-surface);
		box-shadow: var(--editor-shadow-popover);
		/* P3B owns the input contract; P3 stays display-only. */
		pointer-events: none;
	}
	.cube line {
		stroke: var(--editor-outline-muted);
		stroke-width: 1;
		stroke-opacity: 0.55;
		stroke-linejoin: round;
	}
	.shaft {
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	.shaft--x { stroke: var(--editor-gizmo-x); }
	.shaft--y { stroke: var(--editor-gizmo-y); }
	.shaft--z { stroke: var(--editor-gizmo-z); }
	.label {
		font-family: var(--editor-font);
		font-size: var(--editor-orientation-label-size);
		font-weight: 700;
		paint-order: stroke;
		stroke: var(--editor-orientation-surface);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.label--x { fill: var(--editor-gizmo-x); }
	.label--y { fill: var(--editor-gizmo-y); }
	.label--z { fill: var(--editor-gizmo-z); }
</style>
