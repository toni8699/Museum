<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { RuntimeMuseumScene } from '$lib/content/scene';
	import type { MuseumStateStore } from '$lib/state/museum-state.svelte';
	import EditorCameraRig from './EditorCameraRig.svelte';

	let {
		scene,
		state,
		ambientIntensity,
		directionalIntensity,
		fogEnabled,
		fogNear,
		fogFar
	}: {
		scene: RuntimeMuseumScene;
		state: MuseumStateStore;
		ambientIntensity: number;
		directionalIntensity: number;
		fogEnabled: boolean;
		fogNear: number;
		fogFar: number;
	} = $props();
</script>

<div class="viewport" aria-label="Museum editor viewport">
	<Canvas dpr={[1, 1.5]} shadows>
		<MuseumScene
			{scene}
			{state}
			showNavigationNodes={false}
			{ambientIntensity}
			{directionalIntensity}
			{fogEnabled}
			{fogNear}
			{fogFar}
		>
			{#snippet camera(_graph, _state)}
				<EditorCameraRig />
			{/snippet}
		</MuseumScene>
	</Canvas>
</div>

<style>
	.viewport {
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #050508;
	}

	.viewport :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
