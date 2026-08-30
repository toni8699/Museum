<script lang="ts">
	import { T } from '@threlte/core';
	import type { ScenePrimitiveEntity } from '$lib/content/scene';
	import type { EffectiveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
	import SceneInstanceMaterial from '$lib/museum/materials/SceneInstanceMaterial.svelte';
	import type { Vec2 } from '$lib/types/materials';

	let {
		entity,
		effective
	}: {
		entity: ScenePrimitiveEntity;
		effective: EffectiveSceneMaterial;
	} = $props();

	const surfaceSize = $derived.by((): Vec2 => {
		switch (entity.primitive) {
			case 'box':
				return [entity.dimensions.width, entity.dimensions.depth];
			case 'plane':
				return [entity.dimensions.width, entity.dimensions.height];
			case 'cylinder':
				return [entity.dimensions.radius * 2, entity.dimensions.height];
			case 'sphere':
				return [entity.dimensions.radius * 2, entity.dimensions.radius * 2];
		}
	});
</script>

{#if entity.primitive === 'box'}
	<T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
		<T.BoxGeometry
			args={[entity.dimensions.width, entity.dimensions.height, entity.dimensions.depth]}
		/>
		<SceneInstanceMaterial material={effective} {surfaceSize} />
	</T.Mesh>
{:else if entity.primitive === 'plane'}
	<T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
		<T.PlaneGeometry args={[entity.dimensions.width, entity.dimensions.height]} />
		<SceneInstanceMaterial material={effective} {surfaceSize} />
	</T.Mesh>
{:else if entity.primitive === 'cylinder'}
	<T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
		<T.CylinderGeometry args={[entity.dimensions.radius, entity.dimensions.radius, entity.dimensions.height, 32]} />
		<SceneInstanceMaterial material={effective} {surfaceSize} />
	</T.Mesh>
{:else}
	<T.Mesh castShadow={entity.castShadow} receiveShadow={entity.receiveShadow}>
		<T.SphereGeometry args={[entity.dimensions.radius, 32, 24]} />
		<SceneInstanceMaterial material={effective} {surfaceSize} />
	</T.Mesh>
{/if}
