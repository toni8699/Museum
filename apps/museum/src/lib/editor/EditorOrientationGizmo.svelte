<script lang="ts">
	import { Vector3 } from 'three';
	import type { EditorStore } from './editor-store.svelte';
	import {
		CARDINAL_FACE_TO_EYE,
		CARDINAL_FACE_UP,
		createEditorBoundsNeutralFallback,
		resolveEditorCardinalSnapBasis,
		snapEditorViewToCardinal,
		type CardinalView
	} from './camera/editor-camera';
	import {
		createEditorCardinalSnapMotion
	} from '@portfolio/camera-core';
	import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';
	import {
		cancelEditorOrientationSnap,
		editorOrientationGizmo,
		editorOrientationSnapRuntime
	} from './editor-orientation-gizmo.svelte';
	import {
		deriveActiveCardinalFace,
		deriveOrientationFaceTargets,
		deriveOrientationSnapStartPose,
		createOrientationPointerGesture,
		moveOrientationPointerGesture,
		ORIENTATION_PROXY_HIT_SIZE,
		shouldActivateOrientationPointerGesture,
		toOrientationSnapStartPose,
		type OrientationFaceTarget,
		type OrientationInteractionHysteresisState,
		type OrientationPointerGesture
	} from './editor-orientation-interaction';
	import type {
		OrientationPoint2,
		ProjectedOrientationAxis
	} from './editor-orientation-projection';

	// P3B.2–P3B.4 — camera-projected SVG presentation, DOM-owned interaction
	// layer, and animated cardinal snap wiring. Six face buttons use projected
	// polygons or perimeter proxies; positive-axis buttons sit between proxy
	// and painted-face hit priority. Snaps fly through the pure
	// `createEditorCardinalSnapMotion` sampler (320ms ease-out; reduced motion
	// commits instantly); the projector advances and lands the flight.
	let { store, layoutBounds = null }: { store: EditorStore; layoutBounds?: LayoutBounds3 | null } =
		$props();

	const snapshot = $derived(editorOrientationGizmo.snapshot);
	const disabled = $derived(store.cameraPreview !== null);
	const activeFace = $derived(snapshot ? deriveActiveCardinalFace(snapshot.eyeDirection) : null);
	let faceTargets = $state<readonly OrientationFaceTarget[]>([]);
	let hysteresisState: OrientationInteractionHysteresisState | null = null;
	let pointerGesture = $state<OrientationPointerGesture | null>(null);
	let hoveredTargetId = $state<string | null>(null);
	let hoveredFace = $state<CardinalView | null>(null);
	let focusedTargetId = $state<string | null>(null);
	let focusedFace = $state<CardinalView | null>(null);
	let orientationBox = $state<HTMLDivElement | null>(null);
	const pressedTargetId = $derived(
		pointerGesture && !pointerGesture.cancelled ? pointerGesture.targetId : null
	);
	const FACE_NAMES: Record<CardinalView, string> = {
		'+X': 'RIGHT',
		'-X': 'LEFT',
		'+Y': 'TOP',
		'-Y': 'BOTTOM',
		'+Z': 'FRONT',
		'-Z': 'BACK'
	};

	$effect(() => {
		if (!snapshot) {
			faceTargets = [];
			hysteresisState = null;
			return;
		}
		const result = deriveOrientationFaceTargets(snapshot, hysteresisState);
		hysteresisState = result.state;
		faceTargets = result.targets;
	});

	$effect(() => {
		if (!disabled) return;
		// A preview owning the camera also owns the flight: hand off (never a
		// raw clear) so the preview captures a canonical-pole pose.
		cancelEditorOrientationSnap(
			editorOrientationGizmo.camera,
			editorOrientationGizmo.controls
		);
		pointerGesture = null;
		hoveredTargetId = null;
		hoveredFace = null;
		focusedTargetId = null;
		focusedFace = null;
		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && orientationBox?.contains(activeElement)) {
			activeElement.blur();
		}
	});

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

	function faceTargetId(face: CardinalView): string {
		return `face:${face}`;
	}

	function axisTargetId(face: CardinalView): string {
		return `axis:${face}`;
	}

	function proxyCueLabel(face: CardinalView): string {
		return `${FACE_NAMES[face]} · ${face}`;
	}

	function faceTargetStyle(target: OrientationFaceTarget): string {
		if (target.mode === 'polygon' && target.polygon) {
			return `clip-path: polygon(${target.polygon.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
		}
		const center = target.proxyCenter!;
		const cue = target.proxyCueCenter!;
		const half = ORIENTATION_PROXY_HIT_SIZE / 2;
		return [
			`left: ${center[0] - half}px`,
			`top: ${center[1] - half}px`,
			`--proxy-cue-left: ${cue[0] - (center[0] - half) - 22}px`,
			`--proxy-cue-top: ${cue[1] - (center[1] - half) - 7}px`
		].join('; ');
	}

	function axisTargetCenter(axis: ProjectedOrientationAxis): OrientationPoint2 {
		if (axis.reticleCenter) return axis.reticleCenter;
		const polygon = axis.arrowPolygon!;
		return [
			polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
			polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length
		];
	}

	function axisTargetStyle(axis: ProjectedOrientationAxis): string {
		const center = axisTargetCenter(axis);
		return `left: ${center[0] - 7}px; top: ${center[1] - 7}px`;
	}

	function prefersReducedMotion(): boolean {
		return (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	function snap(face: CardinalView) {
		if (disabled) return;
		const camera = editorOrientationGizmo.camera;
		const controls = editorOrientationGizmo.controls;
		if (!camera || !controls) return;
		// Fallback authority per the P3B.1 contract: step 2 frames the
		// compiled layout bounds (from a valid direction — the live orbit
		// pose is exactly what may be invalid here), step 3 falls back to
		// the neutral editor pose. Bounds stay injected from the shell —
		// this widget remains presentation-only.
		const fallback = createEditorBoundsNeutralFallback(
			layoutBounds,
			camera.position,
			controls.target,
			{ fovDegrees: camera.fov, aspect: camera.aspect }
		);
		if (prefersReducedMotion()) {
			// Reduced motion: 0ms direct cardinal commit through the frozen
			// instant primitive. An in-flight snap is cancelled with the full
			// handoff first — the commit overwrites the pose anyway, but the
			// pre-commit basis resolution must not read an interpolated pole.
			cancelEditorOrientationSnap(camera, controls);
			snapEditorViewToCardinal(face, camera, controls, fallback);
			return;
		}
		// Animated path — same resolution phase the instant commit uses
		// (settled basis + inertia drain + atomic no-op). The trajectory comes
		// from the pure sampler in the single camera-motion authority; this
		// widget stores no motion of its own.
		const basis = resolveEditorCardinalSnapBasis(camera, controls, fallback);
		if (!basis) return;
		// Retarget continuity (P3B.4): a click during flight starts from the
		// last applied sample so the new flight continues without a jump.
		const start = deriveOrientationSnapStartPose(
			editorOrientationSnapRuntime.active?.lastSample ?? null,
			toOrientationSnapStartPose(camera.position, controls.target, camera.up)
		);
		editorOrientationSnapRuntime.active = {
			face,
			motion: createEditorCardinalSnapMotion(
				new Vector3(...start.position),
				new Vector3(...start.target),
				new Vector3(...start.up),
				basis.target.clone(),
				new Vector3(...CARDINAL_FACE_TO_EYE[face]),
				basis.distance,
				new Vector3(...CARDINAL_FACE_UP[face])
			),
			elapsedMs: 0,
			lastSample: null
		};
	}

	function activate(event: KeyboardEvent, face: CardinalView, targetId: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		focusedTargetId = targetId;
		focusedFace = face;
		snap(face);
	}

	function isolatePointerEvent(event: PointerEvent) {
		isolateEvent(event);
	}

	function isolateEvent(event: Event) {
		event.preventDefault();
		event.stopPropagation();
	}

	function handlePointerDown(
		event: PointerEvent,
		face: CardinalView,
		targetId: string
	) {
		isolatePointerEvent(event);
		if (disabled || event.button !== 0 || !event.isPrimary) return;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		pointerGesture = createOrientationPointerGesture({
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY,
			targetId,
			face
		});
	}

	function handlePointerMove(event: PointerEvent) {
		isolatePointerEvent(event);
		if (!pointerGesture) return;
		pointerGesture = moveOrientationPointerGesture(
			pointerGesture,
			event.pointerId,
			event.clientX,
			event.clientY
		);
	}

	function handlePointerUp(event: PointerEvent, face: CardinalView, targetId: string) {
		isolatePointerEvent(event);
		// Intentional ≤4px click slop (P3B.3 review disposition 2026-08-25):
		// pointer capture keeps pointerup on the pressed target even if the
		// cursor drifted off its hit area. Sub-threshold releases activate on
		// identity + threshold alone; >4px cancels via the move handler.
		const shouldActivate = shouldActivateOrientationPointerGesture(pointerGesture, {
			pointerId: event.pointerId,
			targetId,
			disabled
		});
		pointerGesture = null;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
		if (shouldActivate) snap(face);
	}

	function clearPointerGesture(event: PointerEvent) {
		isolatePointerEvent(event);
		if (pointerGesture?.pointerId === event.pointerId) pointerGesture = null;
	}

	function handlePointerEnter(face: CardinalView, targetId: string) {
		if (disabled) return;
		hoveredTargetId = targetId;
		hoveredFace = face;
	}

	function handlePointerLeave(targetId: string) {
		if (hoveredTargetId !== targetId) return;
		hoveredTargetId = null;
		hoveredFace = null;
	}

	function handleFocus(event: FocusEvent, face: CardinalView, targetId: string) {
		if (disabled) return;
		const target = event.currentTarget as HTMLElement;
		if (!target.matches(':focus-visible')) return;
		focusedTargetId = targetId;
		focusedFace = face;
	}

	function handleBlur(targetId: string) {
		if (focusedTargetId !== targetId) return;
		focusedTargetId = null;
		focusedFace = null;
	}
</script>

{#if editorOrientationGizmo.ready && snapshot}
	<!-- svelte-ignore a11y_click_events_have_key_events (group isolates pointer/click events from scene navigation; child buttons own keyboard activation) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (group isolates pointer/click events from scene navigation; child buttons own keyboard activation) -->
	<div
		bind:this={orientationBox}
		class="orientation-box"
		class:disabled
		role="group"
		aria-label="Scene orientation — snap the view to a cardinal side"
		aria-disabled={disabled}
		onpointerdown={isolatePointerEvent}
		onpointermove={isolatePointerEvent}
		onpointerup={isolatePointerEvent}
		onpointercancel={isolatePointerEvent}
		onclick={isolateEvent}
	>
		<svg class="orientation-svg" viewBox="0 0 88 88" aria-hidden="true">
			{#each snapshot.faces.filter((face) => face.painted) as face (face.face)}
				<polygon
					points={points(face.polygon)}
					class="face-visual"
					style={`fill: ${faceFill(face.lightAmount)}`}
				/>
				<polygon
					points={points(face.polygon)}
					class="face-state-overlay"
					class:hovered={hoveredFace === face.face}
					class:pressed={pressedTargetId === faceTargetId(face.face)}
					class:active={activeFace === face.face}
					class:focused={
						focusedFace === face.face && focusedTargetId === faceTargetId(face.face)
					}
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
				<g
					class="axis-visual"
					class:hovered={hoveredTargetId === axisTargetId(axis.face)}
					class:pressed={pressedTargetId === axisTargetId(axis.face)}
				>
					{#if axis.foreshortened && axis.reticleCenter}
						<circle
							class="axis-reticle"
							cx={axis.reticleCenter[0]}
							cy={axis.reticleCenter[1]}
							r="3"
							stroke={axisColor(axis)}
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
				</g>
			{/each}
		</svg>

		{#each faceTargets as target (target.face)}
			<button
				type="button"
				class="orientation-target face-target"
				class:polygon={target.mode === 'polygon'}
				class:proxy={target.mode === 'proxy'}
				style={faceTargetStyle(target)}
				aria-label={spokenFaceLabel(target.face)}
				aria-disabled={disabled}
				tabindex={disabled ? -1 : 0}
				{disabled}
				onpointerdown={(event) =>
					handlePointerDown(event, target.face, faceTargetId(target.face))}
				onpointermove={handlePointerMove}
				onpointerup={(event) =>
					handlePointerUp(event, target.face, faceTargetId(target.face))}
				onpointercancel={clearPointerGesture}
				onlostpointercapture={clearPointerGesture}
				onpointerenter={() => handlePointerEnter(target.face, faceTargetId(target.face))}
				onpointerleave={() => handlePointerLeave(faceTargetId(target.face))}
				onfocus={(event) => handleFocus(event, target.face, faceTargetId(target.face))}
				onblur={() => handleBlur(faceTargetId(target.face))}
				onkeydown={(event) => activate(event, target.face, faceTargetId(target.face))}
			>
				{#if target.mode === 'proxy'}
					<span class="proxy-cue" aria-hidden="true">{proxyCueLabel(target.face)}</span>
				{/if}
			</button>
		{/each}

		{#each snapshot.axes as axis (axis.face)}
			<button
				type="button"
				class="orientation-target axis-target"
				style={axisTargetStyle(axis)}
				aria-label={spokenFaceLabel(axis.face)}
				aria-disabled={disabled}
				tabindex={disabled ? -1 : 0}
				{disabled}
				onpointerdown={(event) =>
					handlePointerDown(event, axis.face, axisTargetId(axis.face))}
				onpointermove={handlePointerMove}
				onpointerup={(event) =>
					handlePointerUp(event, axis.face, axisTargetId(axis.face))}
				onpointercancel={clearPointerGesture}
				onlostpointercapture={clearPointerGesture}
				onpointerenter={() => handlePointerEnter(axis.face, axisTargetId(axis.face))}
				onpointerleave={() => handlePointerLeave(axisTargetId(axis.face))}
				onfocus={(event) => handleFocus(event, axis.face, axisTargetId(axis.face))}
				onblur={() => handleBlur(axisTargetId(axis.face))}
				onkeydown={(event) => activate(event, axis.face, axisTargetId(axis.face))}
			></button>
		{/each}
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
		touch-action: none;
		transition:
			background 100ms ease,
			opacity 100ms ease,
			filter 100ms ease;
	}
	.orientation-box:not(.disabled):hover {
		background: var(--editor-orientation-hover);
	}
	.orientation-box.disabled {
		opacity: 0.38;
		filter: grayscale(80%);
		pointer-events: none;
	}
	.orientation-svg {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		z-index: 0;
	}
	.orientation-target {
		position: absolute;
		box-sizing: border-box;
		margin: 0;
		padding: 0;
		border: 0;
		appearance: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		overflow: visible;
		touch-action: none;
	}
	.orientation-target:focus {
		outline: none;
	}
	.face-target.polygon {
		inset: 0;
		width: 88px;
		height: 88px;
		z-index: 3;
	}
	.face-target.proxy {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		z-index: 1;
	}
	.face-target.proxy:hover {
		background: var(--editor-orientation-hover);
	}
	/* Spec §P3B.3 focus-visible: 2px outer stroke in --editor-gizmo-hover. */
	.face-target.proxy:focus-visible {
		background: var(--editor-orientation-hover);
		box-shadow: 0 0 0 2px var(--editor-gizmo-hover);
	}
	.axis-target {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		z-index: 2;
	}
	/* Spec §P3B.3 focus-visible: 2px outer stroke in --editor-gizmo-hover. */
	.axis-target:focus-visible {
		box-shadow: 0 0 0 2px var(--editor-gizmo-hover);
	}
	.proxy-cue {
		position: absolute;
		left: var(--proxy-cue-left);
		top: var(--proxy-cue-top);
		display: grid;
		place-items: center;
		width: 44px;
		height: 14px;
		box-sizing: border-box;
		border: 1px solid var(--editor-orientation-border);
		border-radius: 3px;
		background: var(--editor-orientation-surface);
		color: var(--editor-orientation-label);
		font: 650 7px / 1 var(--editor-font);
		letter-spacing: -0.1px;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 80ms ease;
	}
	.face-target.proxy:hover .proxy-cue,
	.face-target.proxy:focus-visible .proxy-cue {
		opacity: 1;
	}
	.face-visual {
		stroke: none;
		pointer-events: none;
	}
	.face-state-overlay {
		stroke: none;
		fill: transparent;
		pointer-events: none;
		vector-effect: non-scaling-stroke;
	}
	.face-state-overlay.hovered {
		fill: var(--editor-orientation-face-hover);
	}
	.face-state-overlay.pressed {
		fill: var(--editor-orientation-face-pressed);
	}
	.face-state-overlay.active {
		stroke: var(--editor-gizmo-active);
		stroke-width: 1.5;
	}
	.face-state-overlay.focused {
		stroke: var(--editor-gizmo-hover);
		stroke-width: 2;
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
	}
	.axis-reticle {
		fill: var(--editor-orientation-surface);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.axis-visual.hovered {
		filter: drop-shadow(0 0 1.5px var(--editor-gizmo-hover));
	}
	.axis-visual.pressed {
		opacity: 0.72;
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
