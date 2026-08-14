<script lang="ts">
	import { T } from '@threlte/core';
	import { DoubleSide, Shape, type BufferGeometry, type Material } from 'three';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import type { LayoutInteractionState } from './layout-interaction';
	import type { LayoutVec2 } from './layout-types';
	import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';
	import {
		FLOOR_MATERIAL,
		OPENING_HIGHLIGHT_MATERIAL,
		WALL_HIGHLIGHT_MATERIAL,
		WALL_MATERIAL_DEFAULT
	} from './layout-wall-material';
	import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
	import type { IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
	import {
		buildWallHighlightMesh,
		matchOpeningRanges,
		matchWallRanges,
		toWallBufferGeometry,
		type WallMeshMaterialFactory
	} from '$lib/render/wall-geometry-adapter';

	let {
		model,
		geometry,
		wallMeshesByRoom,
		interaction,
		showCeilings = false
	}: {
		model: LayoutPreviewModel;
		geometry: CompiledLayoutGeometry;
		wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
		interaction: LayoutInteractionState;
		showCeilings?: boolean;
	} = $props();

	function polygonShape(points: readonly LayoutVec2[]): Shape {
		const shape = new Shape();
		const first = points[0];
		if (!first) return shape;
		shape.moveTo(first[0], first[1]);
		for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
		shape.closePath();
		return shape;
	}

	// Build each room's floor + ceiling Shape once per compiled geometry.
	// Selection / drag re-renders must not reallocate shapes or rebuild geometry.
	const roomShapes = $derived(
		geometry.rooms.map((room) => ({
			floor: polygonShape(floorShapePoints(room.floorPolygon)),
			ceiling: polygonShape(ceilingShapePoints(room.ceilingPolygon))
		}))
	);

	// Selection-independent base classifier: every surface class resolves to the
	// shared default wall material. Selection color lives only on the overlay,
	// never on the base mesh. The highlight materials are module-level singletons
	// (see layout-wall-material.ts) so workspace remounts cannot leak materials.
	const wallMaterialFactory: WallMeshMaterialFactory = () => ({ material: WALL_MATERIAL_DEFAULT });

	type AdaptedRoom = { geometry: BufferGeometry; materials: Material[]; dispose: () => void };
	let adaptedRooms = $state<Map<string, AdaptedRoom>>(new Map());

	// Wrap each prebuilt room mesh through the adapter; dispose the previous
	// generation when `geometry`/`wallMeshesByRoom` change or on unmount.
	$effect(() => {
		const built = new Map<string, AdaptedRoom>();
		for (const room of geometry.rooms) {
			const mesh = wallMeshesByRoom.get(room.roomId);
			if (mesh) built.set(room.roomId, toWallBufferGeometry(mesh, wallMaterialFactory));
		}
		adaptedRooms = built;
		return () => {
			for (const adapted of built.values()) adapted.dispose();
		};
	});

	// Highlight overlay for the current wall/opening selection: a thin shell over
	// the matched range set, rebuilt and disposed on every selection change.
	let highlight = $state<{ geometry: BufferGeometry; material: Material } | null>(null);

	$effect(() => {
		const selection = interaction.selection;
		let overlay: BufferGeometry | null = null;
		let material: Material | null = null;

		if (selection.kind === 'wall' || selection.kind === 'interiorAnchor') {
			const mesh = wallMeshesByRoom.get(selection.roomId);
			if (mesh) {
				const ranges = matchWallRanges(mesh, selection.segmentId);
				if (ranges.length > 0) {
					overlay = buildWallHighlightMesh(mesh, ranges);
					material = WALL_HIGHLIGHT_MATERIAL;
				}
			}
		} else if (selection.kind === 'opening') {
			const mesh = wallMeshesByRoom.get(selection.roomId);
			if (mesh) {
				const ranges = matchOpeningRanges(mesh, selection.openingId);
				if (ranges.length > 0) {
					overlay = buildWallHighlightMesh(mesh, ranges);
					material = OPENING_HIGHLIGHT_MATERIAL;
				}
			}
		}

		highlight = overlay && material ? { geometry: overlay, material } : null;
		return () => {
			overlay?.dispose();
		};
	});
</script>

<T.Group name="LayoutPreviewRoot">
	{#each geometry.rooms as room, roomIndex (room.roomId)}
		{@const shapes = roomShapes[roomIndex]!}
		{@const adapted = adaptedRooms.get(room.roomId)}
		<T.Group name={`LayoutRoom:${room.roomId}`}>
			<T.Mesh
				name={`LayoutFloor:${room.roomId}`}
				material={FLOOR_MATERIAL}
				position={[0, room.floorElevation, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
				userData={{
					surfaceType: 'floor',
					roomId: room.roomId,
					editorSurface: { type: 'floor', placeable: true, roomId: room.roomId }
				}}
			>
				<T.ShapeGeometry args={[shapes.floor]} />
			</T.Mesh>

			{#if showCeilings}
				<T.Mesh
					name={`LayoutCeiling:${room.roomId}`}
					position={[0, room.ceilingElevation, 0]}
					rotation={[Math.PI / 2, 0, 0]}
					renderOrder={2}
				>
					<T.ShapeGeometry args={[shapes.ceiling]} />
					<T.MeshBasicMaterial color="#d8c9a6" side={DoubleSide} />
				</T.Mesh>
			{/if}

			{#if adapted}
				<T.Mesh
					name={`LayoutWall:${room.roomId}`}
					geometry={adapted.geometry}
					material={adapted.materials}
					castShadow
					receiveShadow
				/>
			{/if}
		</T.Group>
	{/each}

	{#if highlight}
		<T.Mesh
			name="LayoutWallHighlight"
			geometry={highlight.geometry}
			material={highlight.material}
			renderOrder={3}
		/>
	{/if}

	{#each model.objects as object (object.objectId)}
		<T.Group
			name={`LayoutObject:${object.objectId}`}
			position={interaction.objectDrag?.objectId === object.objectId
				? interaction.objectDrag.candidatePosition
				: object.position}
			rotation={object.rotation}
			userData={{ editorEntity: 'layout-object', layoutObjectId: object.objectId }}
		>
			<T.Mesh
				castShadow
				receiveShadow
				scale={object.kind === 'sphere'
					? object.dimensions
					: object.kind === 'cylinder'
						? [1, 1, object.dimensions[2] / object.dimensions[0]]
						: [1, 1, 1]}
			>
				{#if object.kind === 'box' || object.kind === 'plane' || object.kind === 'profile'}
					<T.BoxGeometry args={object.dimensions} />
				{:else if object.kind === 'cylinder'}
					<T.CylinderGeometry
						args={[object.dimensions[0] / 2, object.dimensions[0] / 2, object.dimensions[1], 24]}
					/>
				{:else}
					<T.SphereGeometry args={[0.5, 24, 16]} />
				{/if}
				<T.MeshStandardMaterial
					color={interaction.selection.kind === 'object' &&
					interaction.selection.objectId === object.objectId
						? '#d6b35f'
						: object.readonly
							? '#756f82'
							: '#84907b'}
					roughness={0.78}
					metalness={0}
				/>
			</T.Mesh>
		</T.Group>
	{/each}
</T.Group>
