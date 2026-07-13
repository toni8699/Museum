<script lang="ts">
  import { onMount } from 'svelte';
  import { T, useTask, useThrelte } from '@threlte/core';
  import {
    CurvePath,
    LineCurve3,
    MathUtils,
    PerspectiveCamera,
    QuadraticBezierCurve3,
    Spherical,
    Vector3
  } from 'three';
  import { getNode } from '$lib/content/rooms';
  import { museumState } from '$lib/state/museum-state.svelte';
  import { getCameraRoute } from './camera-route';

  let cameraRef = $state<PerspectiveCamera>();

  const initialNode = getNode('entrance-start');
  const currentPosition = new Vector3(...initialNode.position);
  const currentTarget = new Vector3(...initialNode.cameraTarget);
  let positionPath = createRoundedPath([currentPosition.clone()]);
  let targetPath = createRoundedPath([currentTarget.clone()]);

  let activeTargetNodeId = $state<string | null>(null);
  let transitionProgress = $state(1);
  let transitionDuration = 1.2;

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

  const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  const canLookAround = () =>
    museumState.currentRoomId === 'paris' &&
    !museumState.isTransitioning &&
    activeTargetNodeId === null;

  function cancelPointerLook() {
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    pointerId = null;
    canvas.style.cursor = canLookAround() ? 'grab' : '';
  }

  function createRoundedPath(points: Vector3[], maximumRadius = 0.42) {
    const path = new CurvePath<Vector3>();

    if (points.length === 1) {
      path.add(new LineCurve3(points[0], points[0].clone()));
      return path;
    }

    let cursor = points[0].clone();

    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const corner = points[index];
      const next = points[index + 1];
      const incoming = corner.clone().sub(previous);
      const outgoing = next.clone().sub(corner);
      const trim = Math.min(maximumRadius, incoming.length() * 0.2, outgoing.length() * 0.2);

      if (trim < 0.01) continue;

      const beforeCorner = corner.clone().addScaledVector(incoming.normalize(), -trim);
      const afterCorner = corner.clone().addScaledVector(outgoing.normalize(), trim);
      path.add(new LineCurve3(cursor, beforeCorner));
      path.add(new QuadraticBezierCurve3(beforeCorner, corner, afterCorner));
      cursor = afterCorner;
    }

    path.add(new LineCurve3(cursor, points.at(-1)?.clone() ?? cursor.clone()));
    return path;
  }

  $effect(() => {
    const targetNodeId = museumState.targetNodeId;
    if (!targetNodeId || targetNodeId === activeTargetNodeId) return;

    const route = getCameraRoute(museumState.activeNodeId, targetNodeId);
    const positions = route.positions.map((point) => new Vector3(...point));
    const targets = route.targets.map((point) => new Vector3(...point));
    positions[0] = currentPosition.clone();
    targets[0] = currentTarget.clone();
    positionPath = createRoundedPath(positions, Math.min(0.42, route.clearance));
    targetPath = createRoundedPath(targets, 0.65);
    transitionDuration = Math.min(4.8, Math.max(1.25, positionPath.getLength() / 6.2));
    activeTargetNodeId = targetNodeId;
    transitionProgress = museumState.reducedMotion ? 1 : 0;
  });

  useTask((delta) => {
    if (!cameraRef) return;

    if (activeTargetNodeId) {
      const speed = museumState.reducedMotion ? 24 : 1 / transitionDuration;
      transitionProgress = Math.min(1, transitionProgress + delta * speed);
      const eased = smootherstep(transitionProgress);
      positionPath.getPointAt(eased, currentPosition);
      targetPath.getPointAt(eased, currentTarget);

      if (transitionProgress >= 1) {
        const completed = activeTargetNodeId;
        activeTargetNodeId = null;
        museumState.completeTransition(completed);
      }
    } else {
      const node = getNode(museumState.activeNodeId);
      currentPosition.set(...node.position);
      currentTarget.set(...node.cameraTarget);

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
        museumState.goNext();
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Backspace') {
        event.preventDefault();
        museumState.goBack();
      }
      if (event.key === 'm' || event.key === 'M') museumState.toggleTourMode();
      if (event.key === 'r' || event.key === 'R') museumState.toggleReducedMotion();
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
    const activeNodeId = museumState.activeNodeId;
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
  fov={54}
  near={0.1}
  far={90}
/>
