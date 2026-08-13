<script lang="ts">
	import { onMount } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { Raycaster, Vector2, type Object3D } from 'three';
	import { selectLayoutObject, type LayoutInteractionState } from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';

	let {
		preview: _preview,
		interaction
	}: {
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
	} = $props();

	const { camera, scene, canvas } = useThrelte();
	const raycaster = new Raycaster();
	const pointer = new Vector2();

	function layoutObjectId(object: Object3D): string | null {
		let current: Object3D | null = object;
		while (current) {
			if (current.userData?.editorEntity === 'layout-object') return current.userData.layoutObjectId as string;
			current = current.parent;
		}
		return null;
	}

	function onPointerUp(event: PointerEvent) {
		if (event.button !== 0 || interaction.viewMode !== '3d' || interaction.tool !== 'select') return;
		const currentCamera = camera.current;
		if (!currentCamera) return;
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointer, currentCamera);
		for (const hit of raycaster.intersectObjects(scene.children, true)) {
			const objectId = layoutObjectId(hit.object);
			if (objectId) {
				selectLayoutObject(interaction, objectId);
				return;
			}
		}
	}

	onMount(() => {
		canvas.addEventListener('pointerup', onPointerUp, true);
		return () => canvas.removeEventListener('pointerup', onPointerUp, true);
	});
</script>
