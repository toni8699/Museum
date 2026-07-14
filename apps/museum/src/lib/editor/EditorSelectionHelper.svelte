<script lang="ts">
	import { BoxHelper, type Material } from 'three';
	import { useTask, useThrelte } from '@threlte/core';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
	const { scene } = useThrelte();
	let helpers: BoxHelper[] = [];

	function disposeHelper(helper: BoxHelper) {
		helper.removeFromParent();
		helper.geometry.dispose();
		const material = helper.material as Material | Material[];
		if (Array.isArray(material)) for (const entry of material) entry.dispose();
		else material.dispose();
	}

	$effect(() => {
		void store.selectionKey;
		const roots = store.getPlacementRoots();
		const next = roots.map((root) => {
			const helper = new BoxHelper(root, 0xd6b35f);
			helper.raycast = () => null;
			helper.renderOrder = 1000;
			const material = helper.material as Material & { depthTest?: boolean };
			material.depthTest = false;
			scene.add(helper);
			return helper;
		});
		helpers = next;
		return () => {
			for (const helper of next) disposeHelper(helper);
			if (helpers === next) helpers = [];
		};
	});

	useTask(() => {
		for (const helper of helpers) helper.update();
	});
</script>
