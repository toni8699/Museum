<script lang="ts">
	import {
		Box3,
		Box3Helper,
		BufferAttribute,
		BufferGeometry,
		LineBasicMaterial,
		LineSegments,
		Matrix4,
		Mesh,
		type Material,
		type Object3D
	} from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import { getContext } from 'svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';	import { box3CornersToLineGeometry, localCornersInto } from './obb-util';

	let { store }: { store: MuseumEditorStore } = $props();
	const { scene } = useThrelte();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	type SelectionRecord = {
		root: Object3D;
		rootLocalBox: Box3;
		geometry: BufferGeometry;
		material: LineBasicMaterial;
		lineSegments: LineSegments;
		positions: Float32Array;
	};

	let selectionRecords: SelectionRecord[] = [];

	let hoverBox: Box3 | null = null;
	let hoverHelper: Box3Helper | null = null;
	let hoverRoot: Object3D | null = null;

	/**
	 * Walk the placement root and union each Mesh subtree child's geometry bbox,
	 * transformed by the child's local matrix relative to root. The result is an
	 * axis-aligned box in *placement-local* space — necessary because per-frame
	 * streaming applies the placement's world matrix at render time.
	 */
	function computeRootLocalBox(root: Object3D): Box3 {
		const box = new Box3().makeEmpty();
		root.updateWorldMatrix(true, false);
		const rootInverse = root.matrixWorld.clone().invert();
		const childWorld = new Matrix4();
		root.traverse((child) => {
			if (!(child instanceof Mesh)) return;
			if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
			const childBox = (child.geometry.boundingBox ?? new Box3()).clone();
			// child world matrix = root.matrixWorld × child.matrix (local-to-root)
			childWorld.copy(child.matrix);
			childWorld.premultiply(root.matrixWorld);
			// Project the union back to placement-local (root.matrixWorld inverse).
			childBox.applyMatrix4(childWorld);
			childBox.applyMatrix4(rootInverse);
			box.union(childBox);
		});
		return box;
	}

	function disposeSelectionRecord(record: SelectionRecord) {
		record.lineSegments.removeFromParent();
		record.material.dispose();
		record.geometry.dispose();
		record.rootLocalBox.makeEmpty();
	}

	function disposeHoverHelper() {
		if (!hoverHelper) return;
		hoverHelper.removeFromParent();
		const material = hoverHelper.material as Material | Material[];
		if (Array.isArray(material)) for (const entry of material) entry.dispose();
		else material.dispose();
		hoverBox = null;
		hoverHelper = null;
		hoverRoot = null;
	}

	// True while the canvas is in any camera preview (visitor or director).
	const isPreviewActive = $derived(store.cameraPreview !== null);

	$effect(() => {
		void store.selectionKey;
		const roots = store.getPlacementRoots();
		const next: SelectionRecord[] = roots.map((root) => {
			const rootLocalBox = computeRootLocalBox(root);
			const { indices, initialFloats } = box3CornersToLineGeometry(rootLocalBox);
			const positionAttribute = new BufferAttribute(initialFloats, 3);
			const geometry = new BufferGeometry();
			geometry.setAttribute('position', positionAttribute);
			geometry.setIndex(new BufferAttribute(indices, 1));
			const material = new LineBasicMaterial({
				color: 0xd6b35f,
				depthTest: false,
				transparent: false,
				fog: false,
				linewidth: 1
			});
			const lineSegments = new LineSegments(geometry, material);
			lineSegments.renderOrder = 1000;
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
		});
		selectionRecords = next;
		interactionStore?.setSelectionSize(next.length);
		return () => {
			for (const record of next) disposeSelectionRecord(record);
			if (selectionRecords === next) selectionRecords = [];
		};
	});

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
		if (hoverRoot === root && hoverHelper) return;
		disposeHoverHelper();
		hoverBox = new Box3();
		hoverHelper = new Box3Helper(hoverBox, 0xffffff);
		hoverRoot = root;
		hoverHelper.raycast = () => null;
		hoverHelper.renderOrder = 999;
		const material = hoverHelper.material as Material & {
			depthTest?: boolean;
			transparent?: boolean;
			opacity?: number;
		};
		material.depthTest = false;
		material.transparent = true;
		material.opacity = 0.35;
		hoverHelper.frustumCulled = false;
		scene.add(hoverHelper);
		return () => disposeHoverHelper();
	});

	useTask(() => {
		for (const record of selectionRecords) {
			record.root.updateWorldMatrix(true, false);
			localCornersInto(record.root.matrixWorld, record.rootLocalBox, record.positions);
			(record.geometry.attributes.position as BufferAttribute).needsUpdate = true;
			record.lineSegments.visible = !isPreviewActive;
		}
		if (hoverHelper && hoverBox && hoverRoot) {
			hoverBox.makeEmpty();
			hoverBox.setFromObject(hoverRoot);
			hoverHelper.visible = !hoverBox.isEmpty();
		}
	});
</script>
