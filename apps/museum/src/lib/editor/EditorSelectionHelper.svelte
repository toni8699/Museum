<script lang="ts">
	import {
		Box3,
		BufferAttribute,
		BufferGeometry,
		LineBasicMaterial,
		LineSegments,
		Matrix4,
		Object3D
	} from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import { getContext } from 'svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';
	import { box3CornersToLineGeometry, localCornersInto } from './obb-util';
	import { computeClusterOBB, computeRootLocalBox } from './cluster-obb';

	let { store }: { store: MuseumEditorStore } = $props();
	const { scene } = useThrelte();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	type LooseRecord = {
		kind: 'loose';
		root: Object3D;
		rootLocalBox: Box3;
		geometry: BufferGeometry;
		material: LineBasicMaterial;
		lineSegments: LineSegments;
		positions: Float32Array;
	};

	type ClusterRecord = {
		kind: 'cluster';
		roots: Object3D[];
		rootLocalBox: Box3;
		frame: Matrix4;
		geometry: BufferGeometry;
		material: LineBasicMaterial;
		lineSegments: LineSegments;
		positions: Float32Array;
	};

	type SelectionRecord = LooseRecord | ClusterRecord;

	let selectionRecords: SelectionRecord[] = [];

	// Hover helper — uses the same OBB LineSegments style as the selection
	// records so the two outlines read as visually consistent (rotated cube
	// that hugs the placement, rather than a world-AABB `Box3Helper`).
	type HoverRecord = {
		root: Object3D;
		rootLocalBox: Box3;
		geometry: BufferGeometry;
		material: LineBasicMaterial;
		lineSegments: LineSegments;
		positions: Float32Array;
	};
	let hoverRecord: HoverRecord | null = null;

	/**
	 * Build a new hover `LineSegments` from `root`'s placement-local OBB. The
	 * per-frame task streams corners through `root.matrixWorld` so the wire
	 * cube rotates with the object — same visual language as the gold selection
	 * OBB, just dimmer.
	 */
	function buildHoverRecord(root: Object3D): HoverRecord {
		const rootLocalBox = computeRootLocalBox(root);
		const { indices, initialFloats } = box3CornersToLineGeometry(rootLocalBox);
		const positionAttribute = new BufferAttribute(initialFloats, 3);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', positionAttribute);
		geometry.setIndex(new BufferAttribute(indices, 1));
		const material = new LineBasicMaterial({
			color: 0xffffff,
			depthTest: false,
			transparent: true,
			fog: false,
			opacity: 0.35,
			linewidth: 1
		});
		const lineSegments = new LineSegments(geometry, material);
		lineSegments.renderOrder = 999;
		lineSegments.frustumCulled = false;
		lineSegments.raycast = () => null;
		if (!isPreviewActive) scene.add(lineSegments);
		return {
			root,
			rootLocalBox,
			geometry,
			material,
			lineSegments,
			positions: initialFloats
		};
	}

	function disposeHoverRecord(record: HoverRecord) {
		record.lineSegments.removeFromParent();
		record.material.dispose();
		record.geometry.dispose();
		record.rootLocalBox.makeEmpty();
	}

	function disposeSelectionRecord(record: SelectionRecord) {
		record.lineSegments.removeFromParent();
		record.material.dispose();
		record.geometry.dispose();
		record.rootLocalBox.makeEmpty();
	}

	function disposeHoverHelper() {
		if (!hoverRecord) return;
		disposeHoverRecord(hoverRecord);
		hoverRecord = null;
	}

	// True while the canvas is in any camera preview (visitor or director).
	const isPreviewActive = $derived(store.cameraPreview !== null);

	$effect(() => {
		void store.selectionKey;
		const clusterId = store.selectedClusterId;
		// Read `store.clusters` so the effect re-runs when cluster membership
		// changes (selection-actions write to document.clusters).
		const cluster = clusterId
			? (store.clusters.find((c) => c.id === clusterId) ?? null)
			: null;
		const roots = cluster
			? store.getPlacementRoots(cluster.memberIds)
			: store.getPlacementRoots();
		const next: SelectionRecord[] = [];
		if (cluster) {
			// Cluster selection — ONE rotation-aware tight OBB around every
			// member. The frame is recomputed each frame in useTask so the
			// box tracks the cluster's principal spread axis in the XZ
			// plane — when the cluster rotates as a unit the wire cube
			// rotates with it. See `cluster-obb.ts` for the math.
			const obb = computeClusterOBB(roots);
			if (obb && !obb.localBox.isEmpty()) {
				next.push(buildClusterRecord(roots, obb));
			}
		} else {
			// Loose multi-select (or single) — one rotation-aware OBB per
			// placement root. Boxes ride each object's own orientation.
			for (const root of roots) {
				next.push(buildLooseRecord(root));
			}
		}
		selectionRecords = next;
		interactionStore?.setSelectionSize(next.length);
		return () => {
			for (const record of next) disposeSelectionRecord(record);
			if (selectionRecords === next) selectionRecords = [];
		};
	});

	/** Loose per-root OBB — rotates with the placement via root.matrixWorld. */
	function buildLooseRecord(root: Object3D): LooseRecord {
		const rootLocalBox = computeRootLocalBox(root);
		const { geometry, corners } = makeLineGeometry(rootLocalBox);
		const material = makeLineMaterial(0xd6b35f);
		const lineSegments = makeLineSegments(geometry, material);
		return {
			kind: 'loose',
			root,
			rootLocalBox,
			geometry,
			material,
			lineSegments,
			positions: corners
		};
	}

	/**
	 * Fill a fresh Box3 with the wireframe machinery. Returns the geometry
	 * AND the Float32Array backing its `position` attribute, since per-frame
	 * `localCornersInto` writes into the same array.
	 */
	function makeLineGeometry(rootLocalBox: Box3): {
		geometry: BufferGeometry;
		corners: Float32Array;
	} {
		const { indices, initialFloats } = box3CornersToLineGeometry(rootLocalBox);
		const positionAttribute = new BufferAttribute(initialFloats, 3);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', positionAttribute);
		geometry.setIndex(new BufferAttribute(indices, 1));
		return { geometry, corners: initialFloats };
	}

	function makeLineMaterial(color: number): LineBasicMaterial {
		return new LineBasicMaterial({
			color,
			depthTest: false,
			transparent: color === 0xffffff,
			fog: false,
			opacity: color === 0xffffff ? 0.35 : 1,
			linewidth: 1
		});
	}

	function makeLineSegments(geometry: BufferGeometry, material: LineBasicMaterial): LineSegments {
		const lineSegments = new LineSegments(geometry, material);
		lineSegments.renderOrder = 1000;
		lineSegments.frustumCulled = false;
		lineSegments.raycast = () => null;
		if (!isPreviewActive) scene.add(lineSegments);
		return lineSegments;
	}

	/**
	 * Cluster record — one tight OBB around every member. The frame matrix is
	 * rebuilt every frame in useTask so the box rotates with the cluster.
	 */
	function buildClusterRecord(
		roots: Object3D[],
		obb: NonNullable<ReturnType<typeof computeClusterOBB>>
	): ClusterRecord {
		const { geometry, corners } = makeLineGeometry(obb.localBox);
		const material = makeLineMaterial(0xd6b35f);
		const lineSegments = new LineSegments(geometry, material);
		lineSegments.renderOrder = 1001; // cluster draws above loose outlines.
		lineSegments.frustumCulled = false;
		lineSegments.raycast = () => null;
		if (!isPreviewActive) scene.add(lineSegments);
		return {
			kind: 'cluster',
			roots,
			rootLocalBox: obb.localBox.clone(),
			frame: obb.frameMatrix.clone(),
			geometry,
			material,
			lineSegments,
			positions: corners
		};
	}

	$effect(() => {
		// Detach/reattach helpers when preview state toggles.
		if (isPreviewActive) {
			for (const record of selectionRecords) {
				record.lineSegments.removeFromParent();
			}
			disposeHoverHelper();
		} else {
			for (const record of selectionRecords) {
				if (!record.lineSegments.parent) scene.add(record.lineSegments);
			}
		}
	});

	$effect(() => {
		const id = interactionStore?.hoverTargetId ?? null;
		if (isPreviewActive) {
			disposeHoverHelper();
			return;
		}
		const root = id ? store.getPlacementRoot(id) ?? null : null;
		if (!root) {
			disposeHoverHelper();
			return;
		}
		if (hoverRecord?.root === root) return;
		disposeHoverHelper();
		hoverRecord = buildHoverRecord(root);
		return () => disposeHoverHelper();
	});

	useTask(() => {
		for (const record of selectionRecords) {
			if (record.kind === 'loose') {
				record.root.updateWorldMatrix(true, false);
				localCornersInto(record.root.matrixWorld, record.rootLocalBox, record.positions);
			} else {
				// Cluster record — recompute the principal-axis frame from
				// the members' world corners every frame. When the user
				// rotates or translates the cluster (gizmo drives every
				// member's matrixWorld), the XZ-plane PCA rotates with
				// them, so the wire box rotates with the cluster.
				const obb = computeClusterOBB(record.roots);
				if (obb && !obb.localBox.isEmpty()) {
					record.rootLocalBox.copy(obb.localBox);
					record.frame.copy(obb.frameMatrix);
					localCornersInto(record.frame, record.rootLocalBox, record.positions);
				} else {
					record.lineSegments.visible = false;
					continue;
				}
			}
			(record.geometry.attributes.position as BufferAttribute).needsUpdate = true;
			record.lineSegments.visible = !isPreviewActive;
		}
		if (hoverRecord) {
			hoverRecord.root.updateWorldMatrix(true, false);
			localCornersInto(hoverRecord.root.matrixWorld, hoverRecord.rootLocalBox, hoverRecord.positions);
			(hoverRecord.geometry.attributes.position as BufferAttribute).needsUpdate = true;
			hoverRecord.lineSegments.visible = !isPreviewActive && !hoverRecord.rootLocalBox.isEmpty();
		}
	});
</script>
