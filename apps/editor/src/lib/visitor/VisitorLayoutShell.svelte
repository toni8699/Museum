<script lang="ts">
	import { T } from '@threlte/core';
	import { Shape, type BufferGeometry, type Material } from 'three';
	import type { LayoutVec2 } from '$lib/layout/layout-types';
	import type { CompiledLayoutGeometry, LayoutBounds3 } from '$lib/layout/layout-geometry-types';
	import type { VisitorRoomPresentation } from './room-presentation';
	import { neutralVisitorRoomPresentation } from './room-presentation';
	import { buildRoomWallMesh } from '$lib/layout/wall-mesh-builder';
	import { toWallBufferGeometry } from '$lib/render/wall-geometry-adapter';
	import { createVisitorWallMaterialFactory } from '$lib/museum/layout/wall-material-factory';
	import MuseumMaterial from '$lib/museum/materials/MuseumMaterial.svelte';
	import RoomPortal from '$lib/museum/layout/RoomPortal.svelte';
	import GroundPlinth from '$lib/museum/layout/GroundPlinth.svelte';

	let {
		geometry,
		presentation
	}: {
		geometry: CompiledLayoutGeometry;
		presentation: Readonly<Record<string, VisitorRoomPresentation>>;
	} = $props();

	function polygonShape(points: readonly LayoutVec2[], invertZ = true): Shape {
		const shape = new Shape();
		const first = points[0];
		if (!first) return shape;
		const mapZ = (point: LayoutVec2) => (invertZ ? -point[1] : point[1]);
		shape.moveTo(first[0], mapZ(first));
		for (const point of points.slice(1)) shape.lineTo(point[0], mapZ(point));
		shape.closePath();
		return shape;
	}

	function roomPresentation(roomId: string) {
		return presentation[roomId] ?? neutralVisitorRoomPresentation;
	}

	type AdaptedRoom =
		| {
				roomId: string;
				ok: true;
				geometry: BufferGeometry;
				materials: Material[];
				dispose: () => void;
		  }
		| { roomId: string; ok: false; bounds: LayoutBounds3 };

	let adaptedRooms = $state<AdaptedRoom[]>([]);

	$effect(() => {
		const materials = createVisitorWallMaterialFactory((roomId) => roomPresentation(roomId).color);
		const built: AdaptedRoom[] = geometry.rooms.map((room) => {
			const result = buildRoomWallMesh(room, { classifySurface: () => 'wall' });
			if (!result.mesh) {
				return { roomId: room.roomId, ok: false, bounds: room.bounds3 };
			}
			const adapted = toWallBufferGeometry(result.mesh, materials.factory);
			return { roomId: room.roomId, ok: true, ...adapted };
		});
		adaptedRooms = built;
		return () => {
			for (const room of built) if (room.ok) room.dispose();
			materials.dispose();
		};
	});

	function adaptedFor(roomId: string): AdaptedRoom | undefined {
		return adaptedRooms.find((room) => room.roomId === roomId);
	}

	function failureBox(bounds: LayoutBounds3) {
		return {
			position: [
				(bounds.min[0] + bounds.max[0]) / 2,
				(bounds.min[1] + bounds.max[1]) / 2,
				(bounds.min[2] + bounds.max[2]) / 2
			] as [number, number, number],
			size: [
				bounds.max[0] - bounds.min[0],
				bounds.max[1] - bounds.min[1],
				bounds.max[2] - bounds.min[2]
			] as [number, number, number]
		};
	}
</script>

<T.Group name="VisitorLayoutShell">
	<GroundPlinth />
	{#each geometry.rooms as room (room.roomId)}
		{@const colors = roomPresentation(room.roomId)}
		{@const adapted = adaptedFor(room.roomId)}
		<T.Group name={`VisitorRoom:${room.roomId}`}>
			<T.Mesh
				name={`VisitorFloor:${room.roomId}`}
				position={[0, room.floorElevation, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
			>
				<T.ShapeGeometry args={[polygonShape(room.floorPolygon)]} />
				<MuseumMaterial materialId="wood-walnut" surfaceSize={[8, 8]} tint={colors.color} />
			</T.Mesh>
			<T.Mesh
				name={`VisitorCeiling:${room.roomId}`}
				position={[0, room.ceilingElevation, 0]}
				rotation={[Math.PI / 2, 0, 0]}
			>
				<T.ShapeGeometry args={[polygonShape(room.ceilingPolygon, false)]} />
				<MuseumMaterial materialId="plaster-warm" surfaceSize={[8, 8]} tint="#111018" textures="off" />
			</T.Mesh>

			{#if adapted?.ok}
				<T.Mesh
					name={`VisitorWall:${room.roomId}`}
					geometry={adapted.geometry}
					material={adapted.materials}
					castShadow
					receiveShadow
				/>
			{:else if adapted?.ok === false}
				<T.Mesh
					name={`VisitorWallFailure:${room.roomId}`}
					position={failureBox(adapted.bounds).position}
				>
					<T.BoxGeometry args={failureBox(adapted.bounds).size} />
					<T.MeshBasicMaterial color="#ff2fd4" wireframe />
				</T.Mesh>
			{/if}

			{#each room.walls as wall (wall.segmentId)}
				{#each wall.openings.filter((opening) => opening.kind === 'door') as opening (opening.openingId)}
					<RoomPortal
						position={[opening.center.point[0], room.floorElevation, opening.center.point[1]]}
						rotation={[0, opening.center.yaw, 0]}
						width={opening.width}
						height={opening.height}
						color={colors.accentColor}
					/>
				{/each}
			{/each}
		</T.Group>
	{/each}
</T.Group>
