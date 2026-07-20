<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useTask, useThrelte } from '@threlte/core';
	import {
		Group,
		Mesh,
		MeshBasicMaterial,
		SphereGeometry
	} from 'three';
	import { Line2 } from 'three/addons/lines/Line2.js';
	import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
	import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
	import {
		createDraftConnectionPositionPath,
		getCameraPathVisualSampleCount,
		getScenePathAnchorWorldPosition
	} from './editor-camera-path';
	import type {
		EditorCameraAnchorUserData,
		EditorCameraConnectionUserData
	} from './editor-selection';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const { scene, canvas, invalidate } = useThrelte();

	type ConnectionHelper = {
		visual: Line2;
		visualGeometry: LineGeometry;
		visualMaterial: LineMaterial;
		pick: Line2;
		pickGeometry: LineGeometry;
		pickMaterial: LineMaterial;
	};

	type AnchorHelper = {
		root: Group;
		marker: Mesh;
		geometry: SphereGeometry;
		material: MeshBasicMaterial;
		connectionId: string;
		anchorId: string;
	};

	const connectionHelpers = new Map<string, ConnectionHelper>();
	const anchorHelpers = new Map<string, AnchorHelper>();
	let resolutionWidth = 0;
	let resolutionHeight = 0;

	function anchorKey(connectionId: string, anchorId: string) {
		return `${connectionId}:${anchorId}`;
	}

	function updateResolution() {
		const width = Math.max(1, canvas.clientWidth);
		const height = Math.max(1, canvas.clientHeight);
		if (width === resolutionWidth && height === resolutionHeight) return;
		resolutionWidth = width;
		resolutionHeight = height;
		for (const helper of connectionHelpers.values()) {
			helper.visualMaterial.resolution.set(width, height);
			helper.pickMaterial.resolution.set(width, height);
		}
		invalidate();
	}

	function createConnectionHelper(connectionId: string): ConnectionHelper {
		const visualGeometry = new LineGeometry();
		const visualMaterial = new LineMaterial({
			color: 0xd6b35f,
			linewidth: 1.25,
			transparent: true,
			opacity: 0.3,
			depthTest: false,
			depthWrite: false,
			worldUnits: false
		});
		const visual = new Line2(visualGeometry, visualMaterial);
		visual.name = `EditorCameraPath:${connectionId}`;
		visual.renderOrder = 900;
		visual.raycast = () => undefined as never;

		const pickGeometry = new LineGeometry();
		const pickMaterial = new LineMaterial({
			color: 0xffffff,
			linewidth: 12,
			transparent: true,
			opacity: 0,
			depthTest: false,
			depthWrite: false,
			worldUnits: false
		});
		pickMaterial.colorWrite = false;
		const pick = new Line2(pickGeometry, pickMaterial);
		pick.name = `EditorCameraPathPick:${connectionId}`;
		pick.renderOrder = 899;
		pick.userData = {
			editorEntity: 'camera-connection',
			connectionId
		} satisfies EditorCameraConnectionUserData;

		visualMaterial.resolution.set(
			Math.max(1, canvas.clientWidth),
			Math.max(1, canvas.clientHeight)
		);
		pickMaterial.resolution.copy(visualMaterial.resolution);
		scene.add(visual, pick);
		return {
			visual,
			visualGeometry,
			visualMaterial,
			pick,
			pickGeometry,
			pickMaterial
		};
	}

	function disposeConnectionHelper(helper: ConnectionHelper) {
		helper.visual.removeFromParent();
		helper.pick.removeFromParent();
		helper.visualGeometry.dispose();
		helper.pickGeometry.dispose();
		helper.visualMaterial.dispose();
		helper.pickMaterial.dispose();
	}

	function createAnchorHelper(connectionId: string, anchorId: string): AnchorHelper {
		const root = new Group();
		const geometry = new SphereGeometry(0.14, 14, 10);
		const material = new MeshBasicMaterial({
			color: 0xffe29a,
			depthTest: false,
			depthWrite: false
		});
		const marker = new Mesh(geometry, material);
		root.name = `EditorCameraAnchor:${connectionId}:${anchorId}`;
		root.userData = {
			editorEntity: 'camera-anchor',
			connectionId,
			anchorId
		} satisfies EditorCameraAnchorUserData;
		marker.renderOrder = 1002;
		root.add(marker);
		scene.add(root);
		store.registerAnchorHelperRoot(connectionId, anchorId, root);
		return { root, marker, geometry, material, connectionId, anchorId };
	}

	function disposeAnchorHelper(helper: AnchorHelper) {
		store.unregisterAnchorHelperRoot(
			helper.connectionId,
			helper.anchorId,
			helper.root
		);
		helper.root.removeFromParent();
		helper.geometry.dispose();
		helper.material.dispose();
	}

	function disposeAll() {
		for (const helper of connectionHelpers.values()) disposeConnectionHelper(helper);
		for (const helper of anchorHelpers.values()) disposeAnchorHelper(helper);
		connectionHelpers.clear();
		anchorHelpers.clear();
	}

	$effect(() => {
		const hidden = Boolean(
			store.isVisitorCameraPreview ||
			store.pendingPlacementAssetId ||
			store.pendingNavigationCommand
		);
		const document = store.document;
		const selection = store.navigationSelection;
		const selectedConnectionId =
			selection?.kind === 'connection' || selection?.kind === 'anchor'
				? selection.connectionId
				: null;
		const hoveredConnectionId = store.hoveredConnectionId;
		const hoveredAnchorId = store.hoveredAnchorId;

		if (hidden) {
			disposeAll();
			return;
		}

		const liveConnectionIds = new Set(document.connections.map((connection) => connection.id));
		for (const [connectionId, helper] of connectionHelpers) {
			if (liveConnectionIds.has(connectionId)) continue;
			disposeConnectionHelper(helper);
			connectionHelpers.delete(connectionId);
		}

		for (const connection of document.connections) {
			let helper = connectionHelpers.get(connection.id);
			if (!helper) {
				helper = createConnectionHelper(connection.id);
				connectionHelpers.set(connection.id, helper);
			}
			const path = createDraftConnectionPositionPath(document, connection.id);
			const points = path.getSpacedPoints(getCameraPathVisualSampleCount(path));
			const positions = points.flatMap((point) => [point.x, point.y, point.z]);
			helper.visualGeometry.setPositions(positions);
			helper.pickGeometry.setPositions(positions);
			helper.visual.computeLineDistances();
			helper.pick.computeLineDistances();
			const selected = selectedConnectionId === connection.id;
			const hovered = hoveredConnectionId === connection.id;
			helper.visualMaterial.linewidth = selected ? 2 : hovered ? 1.6 : 1.25;
			helper.visualMaterial.opacity = selected ? 0.9 : hovered ? 0.55 : 0.3;
			helper.visualMaterial.color.set(selected ? 0xffdd83 : 0xd6b35f);
			helper.visualMaterial.needsUpdate = true;
		}

		const selectedConnection = selectedConnectionId
			? document.connections.find((connection) => connection.id === selectedConnectionId)
			: undefined;
		const desiredAnchorKeys = new Set(
			(selectedConnection?.positionPath.anchors ?? []).map((anchor) =>
				anchorKey(selectedConnection!.id, anchor.id)
			)
		);
		for (const [key, helper] of anchorHelpers) {
			if (desiredAnchorKeys.has(key)) continue;
			disposeAnchorHelper(helper);
			anchorHelpers.delete(key);
		}

		if (selectedConnection) {
			for (const anchor of selectedConnection.positionPath.anchors) {
				const key = anchorKey(selectedConnection.id, anchor.id);
				let helper = anchorHelpers.get(key);
				if (!helper) {
					helper = createAnchorHelper(selectedConnection.id, anchor.id);
					anchorHelpers.set(key, helper);
				}
				helper.root.position.set(...getScenePathAnchorWorldPosition(anchor));
				const selected =
					selection?.kind === 'anchor' && selection.anchorId === anchor.id;
				const hovered =
					hoveredConnectionId === selectedConnection.id && hoveredAnchorId === anchor.id;
				helper.material.color.set(selected ? 0xffffff : hovered ? 0xffefbd : 0xffd36b);
				helper.marker.scale.setScalar(selected ? 1.25 : hovered ? 1.12 : 1);
			}
		}

		updateResolution();
		invalidate();
	});

	useTask(updateResolution);

	onDestroy(disposeAll);
</script>
