<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import {
		BufferGeometry,
		Group,
		Line,
		LineBasicMaterial,
		Mesh,
		MeshBasicMaterial,
		SphereGeometry,
		Vector3
	} from 'three';
	import {
		getSceneCameraViewKeyframeWorldPosition,
		getSceneCameraViewKeyframeWorldTarget
	} from './editor-camera-view';
	import type { EditorCameraViewKeyframeUserData } from './editor-selection';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
	const { scene, invalidate } = useThrelte();

	type ViewMarkerHelper = {
		root: Group;
		marker: Mesh;
		geometry: SphereGeometry;
		material: MeshBasicMaterial;
		connectionId: string;
		direction: 'forward' | 'reverse';
		keyframeId: string;
	};

	type ViewTargetHelper = ViewMarkerHelper & {
		connector: Line;
		connectorGeometry: BufferGeometry;
		connectorMaterial: LineBasicMaterial;
	};

	const markers = new Map<string, ViewMarkerHelper>();
	let targetHelper: ViewTargetHelper | null = null;
	const cameraPosition = new Vector3();
	const targetPosition = new Vector3();

	function helperKey(
		connectionId: string,
		direction: 'forward' | 'reverse',
		keyframeId: string
	) {
		return `${connectionId}:${direction}:${keyframeId}`;
	}

	function createTaggedRoot(
		connectionId: string,
		direction: 'forward' | 'reverse',
		keyframeId: string,
		viewHandle: 'position' | 'target',
		name: string
	) {
		const root = new Group();
		root.name = name;
		root.userData = {
			editorEntity: 'camera-view-keyframe',
			connectionId,
			direction,
			keyframeId,
			viewHandle
		} satisfies EditorCameraViewKeyframeUserData;
		return root;
	}

	function createMarker(
		connectionId: string,
		direction: 'forward' | 'reverse',
		keyframeId: string
	): ViewMarkerHelper {
		const root = createTaggedRoot(
			connectionId,
			direction,
			keyframeId,
			'position',
			`EditorCameraViewKeyframe:${connectionId}:${direction}:${keyframeId}`
		);
		const geometry = new SphereGeometry(0.13, 14, 10);
		const material = new MeshBasicMaterial({
			color: 0x79d8ff,
			depthTest: false,
			depthWrite: false
		});
		const marker = new Mesh(geometry, material);
		marker.renderOrder = 1003;
		root.add(marker);
		scene.add(root);
		return {
			root,
			marker,
			geometry,
			material,
			connectionId,
			direction,
			keyframeId
		};
	}

	function disposeMarker(helper: ViewMarkerHelper) {
		helper.root.removeFromParent();
		helper.geometry.dispose();
		helper.material.dispose();
	}

	function createTarget(
		connectionId: string,
		direction: 'forward' | 'reverse',
		keyframeId: string
	): ViewTargetHelper {
		const root = createTaggedRoot(
			connectionId,
			direction,
			keyframeId,
			'target',
			`EditorCameraViewTarget:${connectionId}:${direction}:${keyframeId}`
		);
		const geometry = new SphereGeometry(0.16, 14, 10);
		const material = new MeshBasicMaterial({
			color: 0xff9ed2,
			depthTest: false,
			depthWrite: false
		});
		const marker = new Mesh(geometry, material);
		marker.renderOrder = 1004;
		root.add(marker);

		const connectorGeometry = new BufferGeometry();
		const connectorMaterial = new LineBasicMaterial({
			color: 0xff9ed2,
			transparent: true,
			opacity: 0.7,
			depthTest: false,
			depthWrite: false
		});
		const connector = new Line(connectorGeometry, connectorMaterial);
		connector.name = `EditorCameraViewConnector:${connectionId}:${direction}:${keyframeId}`;
		connector.renderOrder = 1002;
		connector.raycast = () => undefined as never;
		scene.add(root, connector);
		store.registerViewKeyframeTargetHelperRoot(
			connectionId,
			direction,
			keyframeId,
			root
		);
		return {
			root,
			marker,
			geometry,
			material,
			connector,
			connectorGeometry,
			connectorMaterial,
			connectionId,
			direction,
			keyframeId
		};
	}

	function disposeTarget(helper: ViewTargetHelper) {
		store.unregisterViewKeyframeTargetHelperRoot(
			helper.connectionId,
			helper.direction,
			helper.keyframeId,
			helper.root
		);
		helper.connector.removeFromParent();
		helper.connectorGeometry.dispose();
		helper.connectorMaterial.dispose();
		disposeMarker(helper);
	}

	function disposeAll() {
		for (const helper of markers.values()) disposeMarker(helper);
		markers.clear();
		if (targetHelper) disposeTarget(targetHelper);
		targetHelper = null;
	}

	$effect(() => {
		const hidden = !store.isCameraKeyHelpersActive;
		const document = store.document;
		const selection = store.navigationSelection;
		const activeConnectionId = store.activeCameraConnectionId;
		const direction = activeConnectionId ? store.activeCameraDirection : null;
		const connection = activeConnectionId
			? document.connections.find((candidate) => candidate.id === activeConnectionId)
			: undefined;
		if (hidden || !connection || !direction) {
			disposeAll();
			return;
		}

		const track = connection.viewTracks?.[direction] ?? [];
		const desiredKeys = new Set(
			track.map((keyframe) => helperKey(connection.id, direction, keyframe.id))
		);
		for (const [key, helper] of markers) {
			if (desiredKeys.has(key)) continue;
			disposeMarker(helper);
			markers.delete(key);
		}

		for (const keyframe of track) {
			const key = helperKey(connection.id, direction, keyframe.id);
			let helper = markers.get(key);
			if (!helper) {
				helper = createMarker(connection.id, direction, keyframe.id);
				markers.set(key, helper);
			}
			helper.root.position.set(
				...getSceneCameraViewKeyframeWorldPosition(
					document,
					connection.id,
					direction,
					keyframe.progress,
					store.rooms
				)
			);
			const selected =
				selection?.kind === 'view-keyframe' &&
				selection.connectionId === connection.id &&
				selection.direction === direction &&
				selection.keyframeId === keyframe.id;
			helper.material.color.set(selected ? 0xffffff : 0x79d8ff);
			helper.marker.scale.setScalar(selected ? 1.28 : 1);
		}

		const selectedKeyframe =
			selection?.kind === 'view-keyframe' &&
			selection.connectionId === connection.id &&
			selection.direction === direction
				? track.find((keyframe) => keyframe.id === selection.keyframeId)
				: undefined;
		const targetKey = selectedKeyframe
			? helperKey(connection.id, direction, selectedKeyframe.id)
			: null;
		const currentTargetKey = targetHelper
			? helperKey(
					targetHelper.connectionId,
					targetHelper.direction,
					targetHelper.keyframeId
				)
			: null;
		if (targetHelper && currentTargetKey !== targetKey) {
			disposeTarget(targetHelper);
			targetHelper = null;
		}
		if (selectedKeyframe) {
			targetHelper ??= createTarget(
				connection.id,
				direction,
				selectedKeyframe.id
			);
			cameraPosition.set(
				...getSceneCameraViewKeyframeWorldPosition(
					document,
					connection.id,
					direction,
					selectedKeyframe.progress,
					store.rooms
				)
			);
			targetPosition.set(
				...getSceneCameraViewKeyframeWorldTarget(selectedKeyframe, store.rooms)
			);
			targetHelper.root.position.copy(targetPosition);
			targetHelper.connectorGeometry.setFromPoints([
				cameraPosition,
				targetPosition
			]);
		} else if (targetHelper) {
			disposeTarget(targetHelper);
			targetHelper = null;
		}
		invalidate();
	});

	onDestroy(disposeAll);
</script>
