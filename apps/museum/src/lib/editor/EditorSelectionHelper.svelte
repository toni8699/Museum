<script lang="ts">
	import { BoxHelper, type Material } from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const { scene } = useThrelte();
	let helper: BoxHelper | null = null;

	function disposeHelper(current: BoxHelper) {
		current.removeFromParent();
		current.geometry.dispose();
		const material = current.material as Material | Material[];
		if (Array.isArray(material)) {
			for (const entry of material) entry.dispose();
		} else {
			material.dispose();
		}
	}

	$effect(() => {
		const id = store.selectedPlacementId;
		// getPlacementRoot reads registryVersion for late-register reactivity.
		const root = id ? store.getPlacementRoot(id) : undefined;

		if (!root) {
			helper = null;
			return;
		}

		const next = new BoxHelper(root, 0xd6b35f);
		next.raycast = () => null;
		next.renderOrder = 1000;
		const material = next.material as Material & { depthTest?: boolean };
		material.depthTest = false;
		scene.add(next);
		helper = next;

		return () => {
			disposeHelper(next);
			if (helper === next) helper = null;
		};
	});

	useTask(() => {
		helper?.update();
	});
</script>
