<script lang="ts">
	import { T } from '@threlte/core';
	import { DoubleSide, Shape, type BufferGeometry, type Material } from 'three';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import type { LayoutInteractionState } from './layout-interaction';
	// Deferred (2026-08-16): hover + anchor-helper overlays stay disconnected;
	// the selection-highlight shell below is live. `layoutAnchorHelperPlacements`
	// was imported by the deferred anchor block; restore it with that block
	// when the octahedra return (S6.1+).
	// import { layoutAnchorHelperPlacements } from './layout-3d-picking';
	import type { LayoutVec2 } from './layout-types';
	import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';
	import {
		FLOOR_MATERIAL,
		// Deferred with the hover/anchor shells (S6.1+): LAYOUT_HOVER_COLOR,
		// OPENING_HOVER_MATERIAL, WALL_HOVER_MATERIAL.
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
		// Deferred (2026-08-16): the `showAnchors` (anchor-helper octahedra) and
		// `hoverSelection` (hover preview) props stay removed with their render
		// blocks below; restore them when hover/anchors return (S6.1+). Neither
		// mount (H13DView nor the relic EditorViewport) passes them explicitly.
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

	// Deferred (2026-08-16): the anchor-helper octahedra (yellow dots on
	// auto-bezier walls) were unwanted in the 3D view and stay off.
	// `layoutAnchorHelperPlacements` stays exported from the pure picking
	// module; restore this derivation with the anchor render block when the
	// octahedra return (S6.1+).
	// const anchorPlacements = $derived(layoutAnchorHelperPlacements(geometry));

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

	// Selection-highlight shell (restored 2026-08-16): a gold overlay over the
	// selected wall/opening/anchor range, driven purely by
	// `interaction.selection`. Hierarchy picks (UnifiedProjectTree rows) and
	// direct picks that commit (openings, objects) both light up — tree-picked
	// walls highlight here even though direct 3D wall picks are deferred. The
	// overlay is rebuilt/disposed on selection change; hover overlays stay off
	// (deferred block below).
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

	// Deferred (2026-08-16): the hover-preview shell (cyan tint over the
	// wall/opening surface under the cursor) stays off with the hover feed
	// (see H13DView) — restore alongside S6.1. Object/helper inline hover
	// tinting below is dormant too because nothing feeds `hoverSelection`.
	// let hover = $state<{ geometry: BufferGeometry; material: Material } | null>(null);
	//
	// $effect(() => {
	// 	const selection = hoverSelection;
	// 	const current = interaction.selection;
	// 	let overlay: BufferGeometry | null = null;
	// 	let material: Material | null = null;
	//
	// 	if (selection && selection.kind !== 'none' && selection.kind !== 'room') {
	// 		if (selection.kind === 'wall') {
	// 			const isSelected =
	// 				current.kind === 'wall' &&
	// 				current.roomId === selection.roomId &&
	// 				current.segmentId === selection.segmentId;
	// 			if (!isSelected) {
	// 				const mesh = wallMeshesByRoom.get(selection.roomId);
	// 				if (mesh) {
	// 					const ranges = matchWallRanges(mesh, selection.segmentId);
	// 					if (ranges.length > 0) {
	// 						overlay = buildWallHighlightMesh(mesh, ranges);
	// 						material = WALL_HOVER_MATERIAL;
	// 					}
	// 				}
	// 			}
	// 		} else if (selection.kind === 'opening') {
	// 			const isSelected =
	// 				current.kind === 'opening' &&
	// 				current.roomId === selection.roomId &&
	// 				current.openingId === selection.openingId;
	// 			if (!isSelected) {
	// 				const mesh = wallMeshesByRoom.get(selection.roomId);
	// 				if (mesh) {
	// 					const ranges = matchOpeningRanges(mesh, selection.openingId);
	// 					if (ranges.length > 0) {
	// 						overlay = buildWallHighlightMesh(mesh, ranges);
	// 						material = OPENING_HOVER_MATERIAL;
	// 					}
	// 				}
	// 			}
	// 		}
	// 	}
	//
	// 	hover = overlay && material ? { geometry: overlay, material } : null;
	// 	return () => {
	// 		overlay?.dispose();
	// 	};
	// });
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
					userData={{ surfaceType: 'ceiling', roomId: room.roomId }}
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
					userData={{ surfaceType: 'wall', roomId: room.roomId }}
				/>
			{/if}
		</T.Group>
	{/each}

	<!-- Deferred (2026-08-16): hover + anchor-helper shells stay off; the
		selection-highlight shell is live below. Restore these blocks with the
		hover feed and octahedra (S6.1+). -->
	<!--
		{#if hover}
			<T.Mesh
				name="LayoutWallHover"
				geometry={hover.geometry}
				material={hover.material}
				renderOrder={2}
			/>
		{/if}

		{#if showAnchors}
			{#each anchorPlacements as placement (JSON.stringify([placement.roomId, placement.segmentId, placement.anchorId]))}
				{@const anchorHovered =
					hoverSelection?.kind === 'interiorAnchor' &&
					hoverSelection.roomId === placement.roomId &&
					hoverSelection.segmentId === placement.segmentId &&
					hoverSelection.anchorId === placement.anchorId}
				{@const anchorSelected =
					interaction.selection.kind === 'interiorAnchor' &&
					interaction.selection.roomId === placement.roomId &&
					interaction.selection.segmentId === placement.segmentId &&
					interaction.selection.anchorId === placement.anchorId}
				<T.Group
					name={`LayoutAnchor:${placement.anchorId}`}
					position={[placement.position[0], placement.position[1] + 0.02, placement.position[2]]}
					userData={{
						editorEntity: 'layout-anchor',
						roomId: placement.roomId,
						segmentId: placement.segmentId,
						anchorId: placement.anchorId
					}}
				>
					<T.Mesh>
						<T.OctahedronGeometry args={[0.12]} />
						<T.MeshBasicMaterial
							color={anchorHovered && !anchorSelected ? LAYOUT_HOVER_COLOR : '#d6b35f'}
						/>
					</T.Mesh>
				</T.Group>
			{/each}
		{/if}
	-->

	{#if highlight}
		<T.Mesh
			name="LayoutWallHighlight"
			geometry={highlight.geometry}
			material={highlight.material}
			renderOrder={3}
		/>
	{/if}

	{#each model.objects as object (object.objectId)}
		{@const objectSelected =
			interaction.selection.kind === 'object' &&
			interaction.selection.objectId === object.objectId}
		<!-- Deferred — object hover tint stays off with the hover feed (S6.1+). -->
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
					color={objectSelected
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
