<script lang="ts">
	import { T } from '@threlte/core';
	import type {
		SceneDocument,
		RuntimeScene,
		SceneEntity,
		SceneModelEntity,
		ScenePrimitiveEntity
	} from '$lib/content/scene';
	import {
		isSceneLightEntity,
		isSceneModelEntity,
		isScenePrimitiveEntity,
		modelEntityToPlacement
	} from '$lib/content/scene';
	import { resolveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
	import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import AssetModel from '$lib/museum/assets/AssetModel.svelte';
	import EntityLight from '$lib/museum/entities/EntityLight.svelte';
	import EntityPrimitive from '$lib/museum/entities/EntityPrimitive.svelte';

	let {
		scene,
		rooms
	}: {
		scene: RuntimeScene;
		rooms: LayoutRoomRegistry;
	} = $props();

	const roomGroups = $derived.by(() => {
		const entitiesByRoom = new Map<string, SceneEntity[]>();
		for (const entity of scene.entities) {
			const entities = entitiesByRoom.get(entity.roomId) ?? [];
			entities.push(entity);
			entitiesByRoom.set(entity.roomId, entities);
		}
		return [...entitiesByRoom].map(([roomId, entities]) => {
			let room;
			try {
				room = rooms.getRequired(roomId);
			} catch {
				return null;
			}
			return { room, entities };
		}).filter((group) => group !== null) as Array<{
			room: ReturnType<LayoutRoomRegistry['getRequired']>;
			entities: SceneEntity[];
		}>;
	});

	function entityEffective(
		entity: ScenePrimitiveEntity | SceneModelEntity
	): ReturnType<typeof resolveSceneMaterial> {
		return resolveSceneMaterial(
			{ materials: scene.materials, textures: scene.textures } as Pick<
				SceneDocument,
				'materials' | 'textures'
			>,
			{
				materialInstanceId: entity.materialInstanceId ?? null,
				fallbackCatalogueId: entity.kind === 'primitive' ? entity.materialId : 'paper-aged'
			}
		);
	}
</script>

{#each roomGroups as group (group.room.id)}
	<T.Group position={group.room.position} rotation={group.room.rotation}>
		{#each group.entities as entity (entity.id)}
			{#if isSceneModelEntity(entity)}
				<AssetModel
					assetId={entity.assetId}
					position={entity.position}
					rotation={entity.rotation}
					scale={entity.scale ?? 1}
					fallback={entity.fallback}
					effective={entity.materialInstanceId ? entityEffective(entity) : null}
				/>
			{:else if isScenePrimitiveEntity(entity)}
				<T.Group position={entity.position} rotation={entity.rotation} scale={entity.scale ?? 1}>
					<EntityPrimitive {entity} effective={entityEffective(entity)} />
				</T.Group>
			{:else if isSceneLightEntity(entity)}
				<T.Group position={entity.position} rotation={entity.rotation} scale={entity.scale ?? 1}>
					<EntityLight {entity} />
				</T.Group>
			{/if}
		{/each}
	</T.Group>
{/each}
