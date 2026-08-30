<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { T, useTask, useThrelte } from '@threlte/core';
  import {
    MathUtils,
    PerspectiveCamera,
    Spherical,
    Vector3
  } from 'three';
  import {
    getNode,
    type NavigationGraph
  } from '@portfolio/camera-core';
  import { navigationGraph } from '$lib/content/chopin-project';
  import {
    runtimeState,
    type RuntimeStateStore
  } from '$lib/state/runtime-state.svelte';
  import {
    CAMERA_FOV_UPDATE_EPSILON,
    createCameraMotion,
    createCameraMotionSample,
    sampleCameraMotion,
    VISITOR_CAMERA_PROJECTION,
    type CameraMotion
  } from '@portfolio/camera-core';
  import { getCameraRoute } from '@portfolio/camera-core';

  let {
    graph = navigationGraph,
    state: store = runtimeState
  }: {
    graph?: NavigationGraph;
    state?: RuntimeStateStore;
  } = $props();

  let cameraRef = $state<PerspectiveCamera>();

  const initialNode = untrack(() => getNode(store.activeNodeId, graph));
  const motionSample = createCameraMotionSample();
  const currentPosition = motionSample.position.set(...initialNode.position);
  const currentTarget = motionSample.target.set(...initialNode.cameraTarget);
  motionSample.fov = initialNode.fov;
  let activeMotion: CameraMotion | null = null;

  let activeTargetNodeId = $state<string | null>(null);
  let transitionProgress = $state(1);

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
  let lookNodeId = initialNode.id;
  let pointerId: number | null = null;
  let previousPointerX = 0;
  let previousPointerY = 0;

  const canLookAround = () =>
    store.currentRoomId === 'paris' &&
    !store.isTransitioning &&
    activeTargetNodeId === null;

  function cancelPointerLook() {
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
    canvas.style.cursor = canLookAround() ? 'grab' : '';
  }

  $effect(() => {
    const targetNodeId = store.targetNodeId;
    if (!targetNodeId || targetNodeId === activeTargetNodeId) return;

    const route = getCameraRoute(store.activeNodeId, targetNodeId, graph);
    activeMotion = createCameraMotion(route, {
      position: currentPosition,
      target: currentTarget,
      fov: motionSample.fov
    });
    activeTargetNodeId = targetNodeId;
    transitionProgress = store.reducedMotion ? 1 : 0;
  });

  useTask((delta) => {
    if (!cameraRef) return;

    if (activeTargetNodeId && activeMotion) {
      if (activeMotion.durationSeconds === 0) {
        transitionProgress = 1;
      } else {
        const speed = store.reducedMotion ? 24 : 1 / activeMotion.durationSeconds;
        transitionProgress = Math.min(1, transitionProgress + delta * speed);
      }
      sampleCameraMotion(activeMotion, transitionProgress, motionSample);

      if (transitionProgress >= 1) {
        const completed = activeTargetNodeId;
        activeTargetNodeId = null;
        activeMotion = null;
        store.completeTransition(completed);
      }
    } else {
      const node = getNode(store.activeNodeId, graph);
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

  onMount(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
    };

    const isInteractiveTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest('button, a[href], [role="button"]'));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (event.key === ' ' && isInteractiveTarget(event.target)) return;

      if (canLookAround() && event.key.startsWith('Arrow')) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
          lookYaw = MathUtils.clamp(lookYaw + lookKeyStep, -lookYawLimit, lookYawLimit);
        }
        if (event.key === 'ArrowRight') {
          lookYaw = MathUtils.clamp(lookYaw - lookKeyStep, -lookYawLimit, lookYawLimit);
        }
        if (event.key === 'ArrowUp') {
          lookPitch = MathUtils.clamp(lookPitch - lookKeyStep, -lookUpLimit, lookDownLimit);
        }
        if (event.key === 'ArrowDown') {
          lookPitch = MathUtils.clamp(lookPitch + lookKeyStep, -lookUpLimit, lookDownLimit);
        }
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
        event.preventDefault();
        store.goNext();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Backspace') {
        event.preventDefault();
        store.goBack();
      }
      if (event.key === 'm' || event.key === 'M') store.toggleTourMode();
      if (event.key === 'r' || event.key === 'R') store.toggleReducedMotion();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!canLookAround() || event.button !== 0 || pointerId !== null) return;
      pointerId = event.pointerId;
      previousPointerX = event.clientX;
      previousPointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
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
      canvas.style.cursor = '';
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('lostpointercapture', onPointerEnd);
    };
  });

  $effect(() => {
    const activeNodeId = store.activeNodeId;
    const lookEnabled = canLookAround();

    if (activeNodeId !== lookNodeId) {
      lookNodeId = activeNodeId;
      lookYaw = 0;
      lookPitch = 0;
    }

    if (!lookEnabled) cancelPointerLook();
    else if (pointerId === null) canvas.style.cursor = 'grab';
  });
</script>

<T.PerspectiveCamera
  bind:ref={cameraRef}
  makeDefault
  position={initialNode.position}
  fov={initialNode.fov}
  near={VISITOR_CAMERA_PROJECTION.near}
  far={VISITOR_CAMERA_PROJECTION.far}
/>
