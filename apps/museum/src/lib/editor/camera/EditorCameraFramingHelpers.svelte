<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useTask, useThrelte } from '@threlte/core';
	import {
		BoxGeometry,
		BufferGeometry,
		Group,
		LineBasicMaterial,
		LineSegments,
		Mesh,
		MeshBasicMaterial,
		SphereGeometry,
		Vector3,
		type Material,
		type PerspectiveCamera
	} from 'three';
	import {
		createEditorCameraFramingGeometry,
		createEditorCameraFrustumLinePoints,
		type EditorCameraFramingGeometry
	} from './editor-camera-framing';
	import {
		getSceneCameraViewKeyframeWorldPosition,
		getSceneCameraViewKeyframeWorldTarget
	} from './editor-camera-view';
	import type { EditorCameraFovHandleUserData } from '../editor-selection';
	import type { EditorStore } from '../editor-store.svelte';

	let { store }: { store: EditorStore } = $props();
	const { scene, camera, invalidate } = useThrelte();

	const bodyGeometry = new BoxGeometry(0.28, 0.2, 0.38);
	const bodyMaterial = new MeshBasicMaterial({
		color: 0xffcf67,
		wireframe: true,
		depthTest: false,
		depthWrite: false
	});
	const body = new Mesh(bodyGeometry, bodyMaterial);
	body.name = 'EditorSelectedVirtualCameraBody';
	body.renderOrder = 1005;
	body.raycast = () => undefined as never;

	const frustumGeometry = new BufferGeometry();
	const frustumMaterial = new LineBasicMaterial({
		color: 0xffcf67,
		transparent: true,
		opacity: 0.86,
		depthTest: false,
		depthWrite: false
	});
	const frustum = new LineSegments(frustumGeometry, frustumMaterial);
	frustum.name = 'EditorSelectedVirtualCameraFiniteFrustum';
	frustum.renderOrder = 1004;
	frustum.raycast = () => undefined as never;

	const handleGeometry = new SphereGeometry(0.13, 14, 10);
	const handleMaterial = new MeshBasicMaterial({
		color: 0xffcf67,
		depthTest: false,
		depthWrite: false
	});
	const topHandleRoot = new Group();
	const bottomHandleRoot = new Group();
	const topHandle = new Mesh(handleGeometry, handleMaterial);
	const bottomHandle = new Mesh(handleGeometry, handleMaterial);
	topHandleRoot.name = 'EditorCameraFovHandle:top';
	bottomHandleRoot.name = 'EditorCameraFovHandle:bottom';
	topHandle.renderOrder = 1006;
	bottomHandle.renderOrder = 1006;
	topHandleRoot.add(topHandle);
	bottomHandleRoot.add(bottomHandle);
	scene.add(body, frustum, topHandleRoot, bottomHandleRoot);

	const eye = new Vector3();
	const target = new Vector3();

	function hide() {
		body.visible = false;
		frustum.visible = false;
		topHandleRoot.visible = false;
		bottomHandleRoot.visible = false;
	}

	function framingPose() {
		if (
			store.currentWorkspace !== 'camera' ||
			// The static framing frustum yields to the moving Director playhead
			// frustum for the whole preview session (playing or paused/scrubbing);
			// a playing visitor keeps it hidden too (framing is locked there).
			// A paused visitor still shows it so paused framing stays editable.
			store.isDirectorCameraPreview ||
			(store.isVisitorCameraPreview && store.isCameraPreviewPlaying) ||
			store.pendingPlacementAssetId ||
			store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind
		) {
			return null;
		}
		const selection = store.navigationSelection;
		if (selection?.kind === 'node') {
			const node = store.selectedNavigationNode;
			if (!node) return null;
			return {
				position: store.rooms.point(node.roomId, node.position),
				target: store.rooms.point(node.roomId, node.cameraTarget),
				fov: node.fov,
				userData: {
					editorEntity: 'camera-fov-handle',
					owner: 'node',
					nodeId: node.id
				} as const
			};
		}
		if (selection?.kind === 'view-keyframe') {
			const keyframe = store.selectedViewKeyframe;
			if (!keyframe) return null;
			return {
				position: getSceneCameraViewKeyframeWorldPosition(
					store.document,
					selection.connectionId,
					selection.direction,
					keyframe.progress,
					store.rooms
				),
				target: getSceneCameraViewKeyframeWorldTarget(keyframe, store.rooms),
				fov: keyframe.fov,
				userData: {
					editorEntity: 'camera-fov-handle',
					owner: 'view-keyframe',
					connectionId: selection.connectionId,
					direction: selection.direction,
					keyframeId: selection.keyframeId
				} as const
			};
		}
		return null;
	}

	function updateFrustumLines(geometry: EditorCameraFramingGeometry) {
		frustumGeometry.setFromPoints(createEditorCameraFrustumLinePoints(eye, geometry));
	}

	useTask(() => {
		const pose = framingPose();
		if (!pose) {
			hide();
			return;
		}
		eye.set(pose.position[0], pose.position[1], pose.position[2]);
		target.set(pose.target[0], pose.target[1], pose.target[2]);
		if (eye.distanceToSquared(target) <= 1e-12) {
			hide();
			return;
		}
		const geometry = createEditorCameraFramingGeometry(
			eye,
			target,
			pose.fov,
			(camera.current as PerspectiveCamera | undefined)?.aspect ?? 1
		);
		body.visible = true;
		frustum.visible = true;
		topHandleRoot.visible = true;
		bottomHandleRoot.visible = true;
		body.position.copy(eye);
		body.lookAt(target);
		updateFrustumLines(geometry);
		topHandleRoot.position.set(...geometry.topHandle);
		bottomHandleRoot.position.set(...geometry.bottomHandle);
		topHandleRoot.userData = {
			...pose.userData,
			side: 'top'
		} satisfies EditorCameraFovHandleUserData;
		bottomHandleRoot.userData = {
			...pose.userData,
			side: 'bottom'
		} satisfies EditorCameraFovHandleUserData;
		invalidate();
	});

	onDestroy(() => {
		body.removeFromParent();
		frustum.removeFromParent();
		topHandleRoot.removeFromParent();
		bottomHandleRoot.removeFromParent();
		bodyGeometry.dispose();
		frustumGeometry.dispose();
		handleGeometry.dispose();
		for (const material of [
			bodyMaterial,
			frustumMaterial,
			handleMaterial
		] as Material[]) {
			material.dispose();
		}
	});
</script>
