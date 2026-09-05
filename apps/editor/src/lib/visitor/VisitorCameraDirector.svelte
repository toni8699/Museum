<script lang="ts">
	import { onMount } from 'svelte';
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
	import { MathUtils, Spherical, Vector3 } from 'three';
	import type { PerspectiveCamera } from 'three';
	import {
		getCameraRoute,
		getNode,
		createCameraMotion,
		createCameraMotionSample,
		sampleCameraMotion,
		VISITOR_CAMERA_PROJECTION,
		CAMERA_FOV_UPDATE_EPSILON,
		type CameraMotion
	} from '@portfolio/camera-core';
	import type { NavigationGraph } from '@portfolio/project-model';
	import type { VisitorRuntimeState } from './visitor-runtime-state.svelte';
	import { visitorMainFlowNodeIds } from './visitor-runtime-state.svelte';
	import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';

	let {
		graph,
		visitor,
		bounds = null
	}: {
		graph: NavigationGraph;
		visitor: VisitorRuntimeState;
		bounds?: LayoutBounds3 | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	const authoredStartId = visitor.activeNodeId;
	const hasAuthoredStart = authoredStartId !== '';
	let cameraRef: PerspectiveCamera | undefined = $state(undefined);

	const motionSample = createCameraMotionSample();
	const currentPosition = motionSample.position;
	const currentTarget = motionSample.target;
	// svelte-ignore state_referenced_locally
	if (hasAuthoredStart) {
		const initialNode = getNode(authoredStartId, graph);
		currentPosition.set(...initialNode.position);
		currentTarget.set(...initialNode.cameraTarget);
		motionSample.fov = initialNode.fov;
	} else {
		currentPosition.set(0, 8, 12);
		currentTarget.set(0, 1, 0);
		motionSample.fov = VISITOR_CAMERA_PROJECTION.fov;
	}
	const initialCameraPosition: [number, number, number] = [
		currentPosition.x,
		currentPosition.y,
		currentPosition.z
	];
	const initialCameraFov = motionSample.fov;

	let activeMotion: CameraMotion | null = null;
	let activeTargetNodeId: string | null = $state(null);
	let transitionProgress: number = $state(1);

	const { canvas } = useThrelte();
	const lookDirection = new Vector3();
	const lookSpherical = new Spherical();
	const lookYawLimit = MathUtils.degToRad(130);
	const lookUpLimit = MathUtils.degToRad(32);
	const lookDownLimit = MathUtils.degToRad(25);
	const lookKeyStep = MathUtils.degToRad(4);
	const lookPointerSensitivity = 0.003;
	let lookYaw = 0;
	let lookPitch = 0;
	let lookNodeId = hasAuthoredStart ? authoredStartId : '';

	let pointerId: number | null = null;
	let previousPointerX = 0;
	let previousPointerY = 0;

	const isAuthoredMode = () => visitor.activeNodeId !== '';

	const canLookAround = () =>
		isAuthoredMode() && !visitor.isTransitioning && activeTargetNodeId === null;

	function cancelPointerLook() {
		if (pointerId !== null) {
			try {
				if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
			} catch {
				// Canvas may be detached during takeover teardown.
			}
		}
		pointerId = null;
		if (isAuthoredMode()) canvas.style.cursor = canLookAround() ? 'grab' : '';
		else canvas.style.cursor = '';
	}

	function flowNeighbor(direction: -1 | 1): string | null {
		const flow = visitorMainFlowNodeIds(graph);
		if (!flow || flow.length === 0) return null;
		const index = flow.indexOf(visitor.activeNodeId);
		if (index === -1) return null;
		const neighbor = flow[index + direction];
		if (!neighbor) return null;
		const node = graph.nodeById.get(neighbor);
		if (!node || node.lockInteraction) return null;
		return neighbor;
	}

	$effect(() => {
		const targetNodeId = visitor.targetNodeId;
		if (!targetNodeId || targetNodeId === activeTargetNodeId) return;
		let route;
		try {
			route = getCameraRoute(visitor.activeNodeId, targetNodeId, graph);
		} catch {
			// Disconnected: stay put, clear the request without connecting.
			visitor.targetNodeId = null;
			visitor.isTransitioning = false;
			return;
		}
		activeMotion = createCameraMotion(route, {
			position: currentPosition,
			target: currentTarget,
			fov: motionSample.fov
		});
		activeTargetNodeId = targetNodeId;
		transitionProgress = visitor.reducedMotion ? 1 : 0;
	});

	useTask((delta) => {
		if (!cameraRef) return;
		if (!isAuthoredMode()) return;
		if (activeTargetNodeId && activeMotion) {
			if (activeMotion.durationSeconds === 0) {
				transitionProgress = 1;
			} else {
				const speed = visitor.reducedMotion ? 24 : 1 / activeMotion.durationSeconds;
				transitionProgress = Math.min(1, transitionProgress + delta * speed);
			}
			sampleCameraMotion(activeMotion, transitionProgress, motionSample);
			if (transitionProgress >= 1) {
				const completed = activeTargetNodeId;
				activeTargetNodeId = null;
				activeMotion = null;
				visitor.completeTransition(completed);
			}
		} else {
			let node;
			try {
				node = getNode(visitor.activeNodeId, graph);
			} catch {
				return;
			}
			currentPosition.set(...node.position);
			currentTarget.set(...node.cameraTarget);
			motionSample.fov = node.fov;
			if (canLookAround()) {
				lookDirection.copy(currentTarget).sub(currentPosition);
				lookSpherical.setFromVector3(lookDirection);
				lookSpherical.theta += lookYaw;
				lookSpherical.phi = MathUtils.clamp(
					lookSpherical.phi + lookPitch,
					0.08,
					Math.PI - 0.08
				);
				lookDirection.setFromSpherical(lookSpherical);
				currentTarget.copy(currentPosition).add(lookDirection);
			}
		}
		cameraRef.position.copy(currentPosition);
		cameraRef.lookAt(currentTarget);
		if (Math.abs(cameraRef.fov - motionSample.fov) > CAMERA_FOV_UPDATE_EPSILON) {
			cameraRef.fov = motionSample.fov;
			cameraRef.updateProjectionMatrix();
		}
	});

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		return target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
	}

	function isInteractiveTarget(target: EventTarget | null) {
		return (
			target instanceof HTMLElement &&
			Boolean(target.closest('button, a[href], [role="button"]'))
		);
	}

	function hasModifier(event: KeyboardEvent) {
		return event.ctrlKey || event.metaKey || event.altKey;
	}

	onMount(() => {
		if (!isAuthoredMode()) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			const canvasEl = canvas as HTMLCanvasElement;
			const root = canvasEl.closest('[data-visitor-canvas-root]');
			const active = document.activeElement;
			if (root && active && !root.contains(active)) return;
			if (hasModifier(event)) return;
			if (isEditableTarget(event.target)) return;
			if (isInteractiveTarget(event.target)) return;
			if (event.repeat && (event.key === 'ArrowLeft' || event.key === 'ArrowRight'))
				return;

			const key = event.key;
			if (canLookAround() && (key === 'w' || key === 'W')) {
				event.preventDefault();
				lookPitch = MathUtils.clamp(lookPitch - lookKeyStep, -lookUpLimit, lookDownLimit);
				return;
			}
			if (canLookAround() && (key === 's' || key === 'S')) {
				event.preventDefault();
				lookPitch = MathUtils.clamp(lookPitch + lookKeyStep, -lookUpLimit, lookDownLimit);
				return;
			}
			if (canLookAround() && (key === 'a' || key === 'A')) {
				event.preventDefault();
				lookYaw = MathUtils.clamp(lookYaw + lookKeyStep, -lookYawLimit, lookYawLimit);
				return;
			}
			if (canLookAround() && (key === 'd' || key === 'D')) {
				event.preventDefault();
				lookYaw = MathUtils.clamp(lookYaw - lookKeyStep, -lookYawLimit, lookYawLimit);
				return;
			}
			if (key === 'ArrowRight') {
				const next = flowNeighbor(1);
				if (next) {
					event.preventDefault();
					visitor.requestNode(next);
				}
				return;
			}
			if (key === 'ArrowLeft') {
				const previous = flowNeighbor(-1);
				if (previous) {
					event.preventDefault();
					visitor.requestNode(previous);
				}
				return;
			}
		};

		const onPointerDown = (event: PointerEvent) => {
			if (!canLookAround() || event.button !== 0 || pointerId !== null) return;
			pointerId = event.pointerId;
			previousPointerX = event.clientX;
			previousPointerY = event.clientY;
			try {
				canvas.setPointerCapture(event.pointerId);
			} catch {
				pointerId = null;
				return;
			}
			canvas.style.cursor = 'grabbing';
		};

		const onPointerMove = (event: PointerEvent) => {
			if (pointerId !== event.pointerId || !canLookAround()) return;
			const deltaX = event.clientX - previousPointerX;
			const deltaY = event.clientY - previousPointerY;
			previousPointerX = event.clientX;
			previousPointerY = event.clientY;
			lookYaw = MathUtils.clamp(
				lookYaw - deltaX * lookPointerSensitivity,
				-lookYawLimit,
				lookYawLimit
			);
			lookPitch = MathUtils.clamp(
				lookPitch + deltaY * lookPointerSensitivity,
				-lookUpLimit,
				lookDownLimit
			);
		};

		const onPointerEnd = (event: PointerEvent) => {
			if (pointerId === event.pointerId) cancelPointerLook();
		};

		window.addEventListener('keydown', onKeyDown);
		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerEnd);
		canvas.addEventListener('pointercancel', onPointerEnd);
		canvas.addEventListener('lostpointercapture', onPointerEnd);

		return () => {
			cancelPointerLook();
			try {
				canvas.style.cursor = '';
			} catch {
				// Detached during teardown.
			}
			window.removeEventListener('keydown', onKeyDown);
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerEnd);
			canvas.removeEventListener('pointercancel', onPointerEnd);
			canvas.removeEventListener('lostpointercapture', onPointerEnd);
		};
	});

	$effect(() => {
		if (!isAuthoredMode()) return;
		const activeNodeId = visitor.activeNodeId;
		const lookEnabled = canLookAround();
		if (activeNodeId !== lookNodeId) {
			lookNodeId = activeNodeId;
			lookYaw = 0;
			lookPitch = 0;
		}
		if (!lookEnabled) cancelPointerLook();
		else if (pointerId === null) {
			try {
				canvas.style.cursor = 'grab';
			} catch {
				// Detached.
			}
		}
	});

	const neutralFrame = $derived.by(() => {
		if (!bounds)
			return {
				position: [0, 8, 12] as [number, number, number],
				target: [0, 1, 0] as [number, number, number]
			};
		const center: [number, number, number] = [
			(bounds.min[0] + bounds.max[0]) / 2,
			(bounds.min[1] + bounds.max[1]) / 2,
			(bounds.min[2] + bounds.max[2]) / 2
		];
		const size: [number, number, number] = [
			bounds.max[0] - bounds.min[0],
			bounds.max[1] - bounds.min[1],
			bounds.max[2] - bounds.min[2]
		];
		const radius = Math.max(size[0], size[1], size[2], 2);
		return {
			position: [
				center[0] + radius * 0.6,
				center[1] + radius * 0.7,
				center[2] + radius * 0.9
			] as [number, number, number],
			target: center
		};
	});
</script>

{#if isAuthoredMode()}
	<T.PerspectiveCamera
		bind:ref={cameraRef}
		makeDefault
		position={initialCameraPosition}
		fov={initialCameraFov}
		near={VISITOR_CAMERA_PROJECTION.near}
		far={VISITOR_CAMERA_PROJECTION.far}
	/>
{:else}
	<T.PerspectiveCamera
		bind:ref={cameraRef}
		makeDefault
		position={neutralFrame.position}
		fov={VISITOR_CAMERA_PROJECTION.fov}
		near={VISITOR_CAMERA_PROJECTION.near}
		far={VISITOR_CAMERA_PROJECTION.far}
	/>
	<OrbitControls target={neutralFrame.target} enableDamping={!visitor.reducedMotion} />
{/if}
