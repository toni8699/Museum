<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { GridHelper, type Material } from 'three';

	let { visible }: { visible: boolean } = $props();

	const { scene, invalidate } = useThrelte();
	let grid: GridHelper | null = null;

	function disposeGrid() {
		if (!grid) return;
		grid.removeFromParent();
		grid.geometry.dispose();
		const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
		for (const material of materials as Material[]) material.dispose();
		grid = null;
		invalidate();
	}

	$effect(() => {
		if (!visible) {
			disposeGrid();
			return;
		}
		if (grid) return;
		const nextGrid = new GridHelper(80, 80, 0x8d753c, 0x37342d);
		nextGrid.name = 'EditorCalibrationGrid';
		nextGrid.position.y = 0.002;
		nextGrid.renderOrder = -1;
		nextGrid.raycast = () => undefined as never;
		nextGrid.castShadow = false;
		nextGrid.receiveShadow = false;
		for (const child of nextGrid.children) {
			child.raycast = () => undefined as never;
			child.castShadow = false;
			child.receiveShadow = false;
		}
		grid = nextGrid;
		scene.add(grid);
		invalidate();
	});

	onDestroy(disposeGrid);
</script>
