<script lang="ts">
	import type { EditorStore } from './editor-store.svelte';
	import {
		createEditorBoundsNeutralFallback,
		snapEditorViewToCardinal,
		type CardinalView
	} from './camera/editor-camera';
	import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';

	// P3B.2 — Scene 3D orientation box. Custom SVG/DOM viewport utility (not a
	// Lucide icon, not a scene object): a compact isometric cube/axis
	// construction with the canonical red/green/blue mapping and X/Y/Z labels.
	// Each visible face and each axis arrowhead is an isolated hit target that
	// snaps the viewport camera to that cardinal side through the approved
	// `snapEditorViewToCardinal` contract. The widget is presentation-only: it
	// owns no document/selection/history state, derives its highlight from the
	// actual camera pose, and never enters TransformControls or the preview FSM.
	// P3B.3 adds the full interaction states (hover/pressed/focus-visible,
	// pointer capture, click-vs-drag threshold, Escape cancel, disabled
	// presentation); this slice wires the hit targets and the snap.
	let { store, layoutBounds = null }: { store: EditorStore; layoutBounds?: LayoutBounds3 | null } =
		$props();

	const activeFace = $derived(editorOrientationGizmo.face);

	// Isometric cube geometry (half-size 20, center 44,44 in an 88-unit viewBox;
	// +X right-down, +Y up, +Z left-down — screen y grows downward). The three
	// front faces are solid; the three back faces render as dashed ghosts so all
	// six cardinal faces stay reachable.
	const FRONT_FACES: Array<{ face: CardinalView; points: string; label: string }> = [
		{ face: '+Y', points: '44,4 78.64,24 44,44 9.36,24', label: 'Snap view to top (+Y)' },
		{ face: '+X', points: '78.64,24 78.64,84 44,84 44,44', label: 'Snap view to right (+X)' },
		{ face: '+Z', points: '9.36,84 9.36,24 44,44 44,84', label: 'Snap view to front (+Z)' }
	];
	const GHOST_FACES: Array<{ face: CardinalView; points: string; label: string }> = [
		{ face: '-X', points: '44,44 44,4 9.36,24 9.36,84', label: 'Snap view to left (-X)' },
		{ face: '-Y', points: '78.64,84 44,84 9.36,84 44,44', label: 'Snap view to bottom (-Y)' },
		{ face: '-Z', points: '44,4 78.64,24 78.64,84 44,44', label: 'Snap view to back (-Z)' }
	];
	const AXES: Array<{
		face: CardinalView;
		negative: CardinalView;
		line: { x1: number; y1: number; x2: number; y2: number };
		plusTip: string;
		minusTip: string;
		color: string;
		label: { x: number; y: number; text: string };
	}> = [
		{
			face: '+X',
			negative: '-X',
			line: { x1: 26.68, y1: 39, x2: 61.32, y2: 59 },
			plusTip: '67.38,62.5 59.57,62.03 63.07,55.97',
			minusTip: '20.62,35.5 28.43,35.97 24.93,42.03',
			color: 'var(--editor-gizmo-x)',
			label: { x: 71, y: 67, text: 'X' }
		},
		{
			face: '+Y',
			negative: '-Y',
			line: { x1: 44, y1: 74, x2: 44, y2: 24 },
			plusTip: '44,17 40.5,24 47.5,24',
			minusTip: '44,81 40.5,74 47.5,74',
			color: 'var(--editor-gizmo-y)',
			label: { x: 44, y: 11, text: 'Y' }
		},
		{
			face: '+Z',
			negative: '-Z',
			line: { x1: 61.32, y1: 39, x2: 26.68, y2: 59 },
			plusTip: '20.62,62.5 24.93,55.97 28.43,62.03',
			minusTip: '67.38,35.5 63.07,42.03 59.57,35.97',
			color: 'var(--editor-gizmo-z)',
			label: { x: 18, y: 67, text: 'Z' }
		}
	];

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

{#if editorOrientationGizmo.ready}
	<div
		class="orientation-box"
		role="group"
		aria-label="Scene orientation — snap the view to a cardinal side"
	>
		<svg
			class="orientation-svg"
			viewBox="0 0 88 88"
			role="img"
			aria-label="Cardinal view cube: X red, Y green, Z blue"
		>
			{#each GHOST_FACES as target (target.face)}
				<polygon
					points={target.points}
					class="face ghost"
					class:active={activeFace === target.face}
					role="button"
					tabindex="0"
					aria-label={target.label}
					onclick={() => snap(target.face)}
					onkeydown={(event) => activate(event, target.face)}
				/>
			{/each}
			{#each FRONT_FACES as target (target.face)}
				<polygon
					points={target.points}
					class="face front"
					class:active={activeFace === target.face}
					role="button"
					tabindex="0"
					aria-label={target.label}
					onclick={() => snap(target.face)}
					onkeydown={(event) => activate(event, target.face)}
				/>
			{/each}
			{#each AXES as axis (axis.face)}
				<line
					x1={axis.line.x1}
					y1={axis.line.y1}
					x2={axis.line.x2}
					y2={axis.line.y2}
					class="axis-line"
					stroke={axis.color}
				/>
				<polygon
					points={axis.plusTip}
					class="axis-tip"
					fill={axis.color}
					role="button"
					tabindex="0"
					aria-label={`Snap view to ${axis.face}`}
					onclick={() => snap(axis.face)}
					onkeydown={(event) => activate(event, axis.face)}
				/>
				<polygon
					points={axis.minusTip}
					class="axis-tip"
					fill={axis.color}
					role="button"
					tabindex="0"
					aria-label={`Snap view to ${axis.negative}`}
					onclick={() => snap(axis.negative)}
					onkeydown={(event) => activate(event, axis.negative)}
				/>
				<text class="axis-label" x={axis.label.x} y={axis.label.y} fill={axis.color}>
					{axis.label.text}
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
		padding: var(--editor-orientation-padding);
		border: 1px solid var(--editor-orientation-border);
		border-radius: 6px;
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
	.face {
		cursor: pointer;
	}
	.face.front {
		/* Lighter than the box surface so the cube body reads as a solid
		   construction (quiet dark, per DS §28A). */
		fill: var(--editor-orientation-hover);
		stroke: var(--editor-orientation-border);
		stroke-width: 1.2;
	}
	.face.front.active {
		fill: color-mix(in srgb, var(--editor-orientation-hover) 65%, var(--editor-orientation-label) 35%);
		stroke: var(--editor-orientation-label);
		stroke-width: 1.4;
	}
	.face.ghost {
		fill: none;
		stroke: var(--editor-orientation-border);
		stroke-dasharray: 3 2;
		stroke-width: 1;
		opacity: 0.65;
	}
	.face.ghost.active {
		stroke: var(--editor-orientation-label);
		opacity: 0.95;
	}
	.axis-line {
		stroke-width: 1.3;
		opacity: 0.9;
	}
	.axis-tip {
		stroke: none;
		cursor: pointer;
	}
	.axis-label {
		font: 650 var(--editor-orientation-label-size) / 1 var(--editor-font);
		text-anchor: middle;
		dominant-baseline: central;
		pointer-events: none;
	}
</style>
