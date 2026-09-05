<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { GridHelper, type Material } from 'three';
	import { viewportPalette } from './theme.svelte';

	let {
		visible,
		// S10.1 — grid line opacity (0–1), driven by `session.gridOpacity`.
		opacity = 0.55
	}: { visible: boolean; opacity?: number } = $props();

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

	function applyOpacity(value: number) {
		if (!grid) return;
		const clamped = Math.min(1, Math.max(0, value));
		for (const child of grid.children) {
			const material = (child as { material?: Material }).material;
			if (!material) continue;
			material.transparent = true;
			material.opacity = clamped;
		}
		invalidate();
	}

	$effect(() => {
		// Theme-aware grid ink: brand brass on dark chrome, translucent
		// graphite on light chrome (resolved from tokens.css by theme.svelte.ts).
		const major = viewportPalette.gridMajor;
		const minor = viewportPalette.gridMinor;
		if (!visible) {
			disposeGrid();
			return;
		}
		// A palette change rebuilds the grid (GridHelper bakes the line colors
		// into a vertex-color attribute, so recolor = recreate).
		if (grid && (grid.userData.major !== major || grid.userData.minor !== minor)) {
			disposeGrid();
		}
		if (!grid) {
			const nextGrid = new GridHelper(80, 80, major, minor);
			nextGrid.name = 'EditorCalibrationGrid';
			nextGrid.position.y = 0.002;
			nextGrid.renderOrder = -1;
			nextGrid.raycast = () => undefined as never;
			nextGrid.castShadow = false;
			nextGrid.receiveShadow = false;
			nextGrid.userData = { major, minor };
			for (const child of nextGrid.children) {
				child.raycast = () => undefined as never;
				child.castShadow = false;
				child.receiveShadow = false;
			}
			grid = nextGrid;
			scene.add(grid);
		}
		applyOpacity(opacity);
		invalidate();
	});

	onDestroy(disposeGrid);
</script>