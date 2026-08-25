<script lang="ts">
	import type { EditorStore } from './editor-store.svelte';
	import {
		createEditorBoundsNeutralFallback,
		snapEditorViewToCardinal,
		type CardinalView
	} from './camera/editor-camera';
	import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';
	import type {
		OrientationPoint2,
		ProjectedOrientationAxis
	} from './editor-orientation-projection';

	// P3B.2 — Scene 3D orientation box. Custom camera-projected SVG/DOM viewport
	// utility (not a scene object or second camera). Faces, labels, edges, and
	// corner axes consume the immutable canvas-side projection snapshot. Each
	// face and positive-axis target snaps through the approved cardinal helper.
	// P3B.3 adds the full interaction states (hover/pressed/focus-visible,
	// pointer capture, click-vs-drag threshold, Escape cancel, disabled
	// presentation); this slice preserves current hit wiring around new render.
	let { store, layoutBounds = null }: { store: EditorStore; layoutBounds?: LayoutBounds3 | null } =
		$props();

	const activeFace = $derived(editorOrientationGizmo.face);
	const snapshot = $derived(editorOrientationGizmo.snapshot);
	const FACE_NAMES: Record<CardinalView, string> = {
		'+X': 'RIGHT',
		'-X': 'LEFT',
		'+Y': 'TOP',
		'-Y': 'BOTTOM',
		'+Z': 'FRONT',
		'-Z': 'BACK'
	};

	function points(pointsToFormat: readonly OrientationPoint2[]): string {
		return pointsToFormat.map(([x, y]) => `${x},${y}`).join(' ');
	}

	function faceFill(lightAmount: number): string {
		if (lightAmount <= 0.5) {
			return `color-mix(in srgb, var(--editor-orientation-face-mid) ${lightAmount * 200}%, var(--editor-orientation-face-shadow))`;
		}
		return `color-mix(in srgb, var(--editor-orientation-face-lit) ${(lightAmount - 0.5) * 200}%, var(--editor-orientation-face-mid))`;
	}

	function axisColor(axis: ProjectedOrientationAxis): string {
		if (axis.face === '+X') return 'var(--editor-gizmo-x)';
		if (axis.face === '+Y') return 'var(--editor-gizmo-y)';
		return 'var(--editor-gizmo-z)';
	}

	function spokenFaceLabel(face: CardinalView): string {
		return `Snap view to ${FACE_NAMES[face].toLowerCase()} (${face})`;
	}

	function snap(face: CardinalView) {
		// P3B.2 minimal gate: while a preview owns the camera, preview controls
		// remain the sole authority. The full disabled presentation and gesture
		// contract lands in P3B.3.
		if (store.cameraPreview !== null) return;
		const camera = editorOrientationGizmo.camera;
		const controls = editorOrientationGizmo.controls;
		if (!camera || !controls) return;
		snapEditorViewToCardinal(
			face,
			camera,
			controls,
			// Fallback authority per the P3B.1 contract: step 2 frames the
			// compiled layout bounds (from a valid direction — the live orbit
			// pose is exactly what may be invalid here), step 3 falls back to
			// the neutral editor pose. Bounds stay injected from the shell —
			// this widget remains presentation-only.
			createEditorBoundsNeutralFallback(
				layoutBounds,
				camera.position,
				controls.target,
				{ fovDegrees: camera.fov, aspect: camera.aspect }
			)
		);
	}

	function activate(event: KeyboardEvent, face: CardinalView) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		snap(face);
	}
</script>

{#if editorOrientationGizmo.ready && snapshot}
	<div
		class="orientation-box"
		role="group"
		aria-label="Scene orientation — snap the view to a cardinal side"
	>
		<svg class="orientation-svg" viewBox="0 0 88 88">
			<!-- Preserve six-face reachability until P3B.3 replaces these exact
			     polygons with perimeter proxies and pointer-threshold gestures. -->
			{#each snapshot.faces.filter((face) => !face.painted) as target (target.face)}
				<polygon
					points={points(target.polygon)}
					class="face-hit"
					role="button"
					tabindex="0"
					aria-label={spokenFaceLabel(target.face)}
					onclick={() => snap(target.face)}
					onkeydown={(event) => activate(event, target.face)}
				/>
			{/each}
			{#each snapshot.faces.filter((face) => face.painted) as target (target.face)}
				<polygon
					points={points(target.polygon)}
					class="face-hit"
					role="button"
					tabindex="0"
					aria-label={spokenFaceLabel(target.face)}
					onclick={() => snap(target.face)}
					onkeydown={(event) => activate(event, target.face)}
				/>
			{/each}

			{#each snapshot.faces.filter((face) => face.painted) as face (face.face)}
				<polygon
					points={points(face.polygon)}
					class="face-visual"
					class:active={activeFace === face.face}
					style={`fill: ${faceFill(face.lightAmount)}`}
				/>
			{/each}
			{#each snapshot.edges as edge}
				<line
					x1={edge.start[0]}
					y1={edge.start[1]}
					x2={edge.end[0]}
					y2={edge.end[1]}
					class="cube-edge"
				/>
			{/each}
			{#each snapshot.faces.filter((face) => face.painted) as face (face.face)}
				<text
					class="face-label"
					x={face.center[0]}
					y={face.center[1]}
					opacity={face.labelOpacity}
				>
					{FACE_NAMES[face.face]}
				</text>
			{/each}

			{#each snapshot.axes as axis (axis.face)}
				{#if axis.foreshortened && axis.reticleCenter}
					<circle
						class="axis-reticle"
						cx={axis.reticleCenter[0]}
						cy={axis.reticleCenter[1]}
						r="3"
						stroke={axisColor(axis)}
						role="button"
						tabindex="0"
						aria-label={spokenFaceLabel(axis.face)}
						onclick={() => snap(axis.face)}
						onkeydown={(event) => activate(event, axis.face)}
					/>
				{:else if axis.arrowPolygon}
					<line
						x1={axis.projectedAnchor[0]}
						y1={axis.projectedAnchor[1]}
						x2={axis.projectedShaftEnd[0]}
						y2={axis.projectedShaftEnd[1]}
						class="axis-line"
						stroke={axisColor(axis)}
					/>
					<polygon
						points={points(axis.arrowPolygon)}
						class="axis-tip"
						fill={axisColor(axis)}
						role="button"
						tabindex="0"
						aria-label={spokenFaceLabel(axis.face)}
						onclick={() => snap(axis.face)}
						onkeydown={(event) => activate(event, axis.face)}
					/>
				{/if}
				<text
					class="axis-label"
					x={axis.glyphCenter[0]}
					y={axis.glyphCenter[1]}
					fill={axisColor(axis)}
				>
					{axis.face.slice(1)}
				</text>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.orientation-box {
		position: absolute;
		top: var(--editor-orientation-inset-top);
		right: var(--editor-orientation-inset-right);
		width: var(--editor-orientation-size);
		height: var(--editor-orientation-size);
		box-sizing: border-box;
		padding: 0;
		border: 0;
		box-shadow: inset 0 0 0 1px var(--editor-orientation-border);
		border-radius: var(--editor-orientation-radius);
		background: var(--editor-orientation-surface);
		z-index: 4;
		user-select: none;
	}
	.orientation-svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.face-hit {
		fill: transparent;
		stroke: none;
		pointer-events: all;
		cursor: pointer;
	}
	.face-visual {
		stroke: none;
		pointer-events: none;
	}
	.face-visual.active {
		filter: brightness(1.04);
	}
	.cube-edge {
		stroke: var(--editor-orientation-edge-solid);
		stroke-width: 1;
		pointer-events: none;
		vector-effect: non-scaling-stroke;
	}
	.axis-line {
		stroke-width: 1.5;
		pointer-events: none;
		vector-effect: non-scaling-stroke;
	}
	.axis-tip {
		stroke: none;
		cursor: pointer;
	}
	.axis-reticle {
		fill: var(--editor-orientation-surface);
		stroke-width: 1.5;
		cursor: pointer;
		vector-effect: non-scaling-stroke;
	}
	.face-label {
		fill: var(--editor-orientation-edge-solid);
		font: 700 var(--editor-orientation-face-label-size) / 1 var(--editor-font);
		letter-spacing: -0.15px;
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
	.axis-label {
		font: 650 var(--editor-orientation-label-size) / 1 var(--editor-font);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
</style>
