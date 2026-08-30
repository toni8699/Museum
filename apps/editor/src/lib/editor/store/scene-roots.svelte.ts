import { untrack } from 'svelte';
import type { Object3D } from 'three';

import type { CameraConnectionDirection } from '$lib/types/scene';
import type { EditorCameraHandle } from '../editor-selection';
import {
	anchorHelperKey,
	cameraHelperKey,
	type SceneRootKind,
	viewKeyframeHelperKey
} from '../helpers/scene-keys';

/**
 * `Object3D` registry for editor-only scene helpers. Slice 2 of the
 * editor-facade refactor plan collapses what was previously four
 * `#…Roots = new Map<string, Object3D>()` private fields +
 * `registryVersion = $state(0)` + `#bumpRegistryVersion()` punchline
 * on `EditorStore` into one focused sub-store with a single
 * tagged-key union vector (we keep four `Map`s because the four
 * families use disjoint ID space; revision bumping is unified through
 * the single `version` $state, which god-file getters `void` to
 * register a re-render dependency).
 *
 * Each `register*` / `unregister*` is idempotent on `(root, key)`
 * identity (no-op when the same Object3D was already stored), so
 * re-mounts during HMR or editor mount/unmount churn don't bump
 * `version` needlessly.
 */
export class EditorSceneRoots {
	#placementRoots = new Map<string, Object3D>();
	#cameraHelperRoots = new Map<string, Object3D>();
	#anchorHelperRoots = new Map<string, Object3D>();
	#viewKeyframeTargetHelperRoots = new Map<string, Object3D>();

	/**
	 * Monotonic counter consumers `void`-read so a Svelte 5 $derived
	 * re-runs when any of the four families changes. Bumped inside the
	 * `#setRoot` / `#removeRoot` private helpers; never written by
	 * external callers (use `notifyPlacementRootChanged` to ask for a
	 * forced re-render without changing the underlying root object).
	 */
	version = $state(0);

	// ---------- placement (3 methods) ----------

	registerPlacementRoot(id: string, root: Object3D) {
		this.#setRoot(this.#placementRoots, id, root);
	}

	unregisterPlacementRoot(id: string, root: Object3D) {
		if (this.#placementRoots.get(id) !== root) return;
		this.#removeRoot(this.#placementRoots, id);
	}

	getPlacementRoot(id: string): Object3D | undefined {
		void this.version;
		return this.#placementRoots.get(id);
	}

	// ---------- camera-helper (3 methods) ----------

	registerCameraHelperRoot(nodeId: string, handle: EditorCameraHandle, root: Object3D) {
		this.#setRoot(this.#cameraHelperRoots, cameraHelperKey(nodeId, handle), root);
	}

	unregisterCameraHelperRoot(nodeId: string, handle: EditorCameraHandle, root: Object3D) {
		const key = cameraHelperKey(nodeId, handle);
		if (this.#cameraHelperRoots.get(key) !== root) return;
		this.#removeRoot(this.#cameraHelperRoots, key);
	}

	getCameraHelperRoot(nodeId: string, handle: EditorCameraHandle): Object3D | undefined {
		void this.version;
		return this.#cameraHelperRoots.get(cameraHelperKey(nodeId, handle));
	}

	// ---------- anchor-helper (3 methods) ----------

	registerAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		this.#setRoot(this.#anchorHelperRoots, anchorHelperKey(connectionId, anchorId), root);
	}

	unregisterAnchorHelperRoot(connectionId: string, anchorId: string, root: Object3D) {
		const key = anchorHelperKey(connectionId, anchorId);
		if (this.#anchorHelperRoots.get(key) !== root) return;
		this.#removeRoot(this.#anchorHelperRoots, key);
	}

	getAnchorHelperRoot(connectionId: string, anchorId: string): Object3D | undefined {
		void this.version;
		return this.#anchorHelperRoots.get(anchorHelperKey(connectionId, anchorId));
	}

	// ---------- view-keyframe-target-helper (3 methods) ----------

	registerViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		root: Object3D
	) {
		this.#setRoot(
			this.#viewKeyframeTargetHelperRoots,
			viewKeyframeHelperKey(connectionId, direction, keyframeId),
			root
		);
	}

	unregisterViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		root: Object3D
	) {
		const key = viewKeyframeHelperKey(connectionId, direction, keyframeId);
		if (this.#viewKeyframeTargetHelperRoots.get(key) !== root) return;
		this.#removeRoot(this.#viewKeyframeTargetHelperRoots, key);
	}

	getViewKeyframeTargetHelperRoot(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	): Object3D | undefined {
		void this.version;
		return this.#viewKeyframeTargetHelperRoots.get(
			viewKeyframeHelperKey(connectionId, direction, keyframeId)
		);
	}

	/**
	 * Force a `version` bump without re-storing a root. Used by the
	 * former `notifyPlacementRootChanged` god-file method when a
	 * downstream $derived wants a re-evaluation engine tick.
	 * (Slice 2 v1 keeps this call surface unchanged.)
	 */
	notifyPlacementRootChanged(id: string) {
		if (!this.#placementRoots.has(id)) return;
		untrack(() => {
			this.version++;
		});
	}

	/**
	 * Return every registered key for one family. Per-debug + tests;
	 * never called from the rendering hot path.
	 */
	ids(kind: SceneRootKind): string[] {
		void this.version;
		switch (kind) {
			case 'placement':
				return [...this.#placementRoots.keys()];
			case 'camera-helper':
				return [...this.#cameraHelperRoots.keys()];
			case 'anchor-helper':
				return [...this.#anchorHelperRoots.keys()];
			case 'view-keyframe-target-helper':
				return [...this.#viewKeyframeTargetHelperRoots.keys()];
		}
	}

	#setRoot(map: Map<string, Object3D>, key: string, root: Object3D) {
		if (map.get(key) === root) return;
		map.set(key, root);
		untrack(() => {
			this.version++;
		});
	}

	#removeRoot(map: Map<string, Object3D>, key: string) {
		map.delete(key);
		untrack(() => {
			this.version++;
		});
	}
}
