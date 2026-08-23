<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { useTask, useThrelte } from '@threlte/core';
	import {
		BufferGeometry,
		Group,
		Line,
		LineBasicMaterial,
		Mesh,
		MeshBasicMaterial,
		OctahedronGeometry,
		SphereGeometry,
		Vector3,
		type BufferAttribute,
		type Material
	} from 'three';
	import type { EditorCameraHandleUserData } from '../editor-selection';
	import type { EditorStore } from '../editor-store.svelte';

	let {
		store,
		nodeId,
		positionOnly = false
	}: {
		store: EditorStore;
		nodeId: string;
		positionOnly?: boolean;
	} = $props();
	const editorStore = untrack(() => store);
	const helperNodeId = untrack(() => nodeId);
	const helperPositionOnly = untrack(() => positionOnly);

	const { scene } = useThrelte();
	const positionRoot = new Group();
	const targetRoot = new Group();
	const positionMaterial = new MeshBasicMaterial({
		color: 0xd6b35f,
		depthTest: false,
		depthWrite: false
	});
	const targetMaterial = new MeshBasicMaterial({
		color: 0x5bc8ff,
		depthTest: false,
		depthWrite: false
	});
	const positionMarker = new Mesh(new OctahedronGeometry(0.24), positionMaterial);
	const targetMarker = new Mesh(new SphereGeometry(0.2, 16, 10), targetMaterial);
	const lineGeometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
	const lineMaterial = new LineBasicMaterial({
		color: 0xe9dfc5,
		depthTest: false,
		depthWrite: false,
		transparent: true,
		opacity: 0.72
	});
	const connector = new Line(lineGeometry, lineMaterial);
	const positionWorld = new Vector3();
	const targetWorld = new Vector3();

	positionRoot.name = `EditorCameraPosition:${helperNodeId}`;
	targetRoot.name = `EditorCameraTarget:${helperNodeId}`;
	positionRoot.userData = {
		editorEntity: 'camera-handle',
		nodeId: helperNodeId,
		cameraHandle: 'position'
	} satisfies EditorCameraHandleUserData;
	targetRoot.userData = {
		editorEntity: 'camera-handle',
		nodeId: helperNodeId,
		cameraHandle: 'target'
	} satisfies EditorCameraHandleUserData;
	positionMarker.renderOrder = 1001;
	targetMarker.renderOrder = 1001;
	connector.renderOrder = 1000;
	connector.raycast = () => null as never;
	positionRoot.add(positionMarker);
	targetRoot.add(targetMarker);
	scene.add(positionRoot);
	editorStore.registerCameraHelperRoot(helperNodeId, 'position', positionRoot);
	if (!helperPositionOnly) {
		scene.add(targetRoot, connector);
		editorStore.registerCameraHelperRoot(helperNodeId, 'target', targetRoot);
	}

	function syncFromStore() {
		const node = editorStore.getRuntimeNavigationNode(helperNodeId);
		if (!node) return;
		positionRoot.position.set(...node.position);
		targetRoot.position.set(...node.cameraTarget);
	}

	function updateConnector() {
		positionRoot.getWorldPosition(positionWorld);
		targetRoot.getWorldPosition(targetWorld);
		const position = lineGeometry.getAttribute('position') as BufferAttribute;
		position.setXYZ(0, positionWorld.x, positionWorld.y, positionWorld.z);
		position.setXYZ(1, targetWorld.x, targetWorld.y, targetWorld.z);
		position.needsUpdate = true;
		lineGeometry.computeBoundingSphere();
	}

	$effect(() => {
		void editorStore.scene;
		void editorStore.historyVersion;
		void editorStore.pendingNavigationCommand;
		if (
			editorStore.transformInteractionActive &&
			editorStore.transformInteractionKind === 'camera' &&
			editorStore.cameraSelection?.nodeId === helperNodeId
		) {
			return;
		}
		syncFromStore();
		updateConnector();
	});

	$effect(() => {
		const activeHandle = editorStore.cameraSelection?.nodeId === helperNodeId
			? editorStore.cameraSelection.handle
			: null;
		positionMaterial.color.set(activeHandle === 'position' ? 0xfff0ae : 0xd6b35f);
		targetMaterial.color.set(activeHandle === 'target' ? 0xc9f1ff : 0x5bc8ff);
	});

	useTask(() => {
		if (!helperPositionOnly) updateConnector();
	});

	onDestroy(() => {
		editorStore.unregisterCameraHelperRoot(helperNodeId, 'position', positionRoot);
		if (!helperPositionOnly) {
			editorStore.unregisterCameraHelperRoot(helperNodeId, 'target', targetRoot);
		}
		positionRoot.removeFromParent();
		targetRoot.removeFromParent();
		connector.removeFromParent();
		positionMarker.geometry.dispose();
		targetMarker.geometry.dispose();
		lineGeometry.dispose();
		for (const material of [positionMaterial, targetMaterial, lineMaterial] as Material[]) {
			material.dispose();
		}
	});
</script>
