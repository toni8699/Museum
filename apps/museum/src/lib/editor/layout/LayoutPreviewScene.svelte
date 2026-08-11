<script lang="ts">
	import { T } from '@threlte/core';
	import { DoubleSide, Shape } from 'three';
	import type { LayoutPreviewModel, LayoutRoomPreview, WallPreview } from './layout-mesh-factory';
	import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';

	let {
		model,
		showCeilings = false,
		selectedSegmentId = null,
		selectedOpeningId = null
	}: {
		model: LayoutPreviewModel;
		showCeilings?: boolean;
		selectedSegmentId?: string | null;
		selectedOpeningId?: string | null;
	} = $props();

	function polygonShape(points: LayoutRoomPreview['floorPolygon']): Shape {
		const shape = new Shape();
		const first = points[0];
		if (!first) return shape;
		shape.moveTo(first[0], first[1]);
		for (const point of points.slice(1)) shape.lineTo(point[0], point[1]);
		shape.closePath();
		return shape;
	}

	function wallYaw(wall: WallPreview): number {
		return Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
	}
</script>

<T.Group name="LayoutPreviewRoot">
	{#each model.rooms as room (room.roomId)}
		<T.Group name={`LayoutRoom:${room.roomId}`}>
			<T.Mesh
				name={`LayoutFloor:${room.roomId}`}
				position={[0, room.floorElevation, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
			>
				<T.ShapeGeometry args={[polygonShape(floorShapePoints(room.floorPolygon))]} />
				<T.MeshStandardMaterial color="#6b6254" roughness={0.9} metalness={0} />
			</T.Mesh>

			{#if showCeilings}
			<T.Mesh
				name={`LayoutCeiling:${room.roomId}`}
				position={[0, room.ceilingElevation, 0]}
				rotation={[Math.PI / 2, 0, 0]}
			>
				<T.ShapeGeometry args={[polygonShape(ceilingShapePoints(room.ceilingPolygon))]} />
				<T.MeshStandardMaterial
					color="#b5a993"
					transparent
					opacity={0.12}
					depthWrite={false}
					side={DoubleSide}
					roughness={1}
				/>
			</T.Mesh>
			{/if}

			{#each room.walls as wall (wall.segmentId)}
				<T.Group
					name={`LayoutWall:${wall.segmentId}`}
					position={[wall.start[0], room.floorElevation, wall.start[1]]}
					rotation={[0, -wallYaw(wall), 0]}
				>
					{#each wall.sections as section, sectionIndex (`${wall.segmentId}:${sectionIndex}`)}
						<T.Mesh
							name={`LayoutWallSection:${wall.segmentId}:${sectionIndex}`}
							position={[
								(section.startDistance + section.endDistance) / 2,
								(section.bottomY + section.topY) / 2,
								0
							]}
							castShadow
							receiveShadow
						>
							<T.BoxGeometry
								args={[
									section.endDistance - section.startDistance,
									section.topY - section.bottomY,
									wall.thickness
								]}
							/>
							<T.MeshStandardMaterial
								color={section.openingId === selectedOpeningId ? '#f1d99a' : wall.segmentId === selectedSegmentId ? '#d6b35f' : '#a99d89'}
								roughness={0.82}
								metalness={0}
							/>
						</T.Mesh>
					{/each}
				</T.Group>
			{/each}
		</T.Group>
	{/each}
</T.Group>
