<script lang="ts">
	import { T } from '@threlte/core';
	import { DoubleSide, Shape } from 'three';
	import type { LayoutPreviewModel, LayoutRoomPreview } from './layout-mesh-factory';
	import type { LayoutInteractionState } from './layout-interaction';
	import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';

	let {
		model,
		interaction,
		showCeilings = false,
		selectedSegmentId = null,
		selectedOpeningId = null
	}: {
		model: LayoutPreviewModel;
		interaction: LayoutInteractionState;
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
</script>

<T.Group name="LayoutPreviewRoot">
	{#each model.rooms as room (room.roomId)}
		<T.Group name={`LayoutRoom:${room.roomId}`}>
			<T.Mesh
				name={`LayoutFloor:${room.roomId}`}
				position={[0, room.floorElevation, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
				userData={{
					surfaceType: 'floor',
					roomId: room.roomId,
					editorSurface: { type: 'floor', placeable: true, roomId: room.roomId }
				}}
			>
				<T.ShapeGeometry args={[polygonShape(floorShapePoints(room.floorPolygon))]} />
				<T.MeshStandardMaterial color="#6b6254" roughness={0.9} metalness={0} />
			</T.Mesh>

			<T.Mesh
				name={`LayoutCeiling:${room.roomId}`}
				position={[0, room.ceilingElevation, 0]}
				rotation={[Math.PI / 2, 0, 0]}
				renderOrder={2}
			>
				<T.ShapeGeometry args={[polygonShape(ceilingShapePoints(room.ceilingPolygon))]} />
				<T.MeshBasicMaterial
					color="#d8c9a6"
					transparent={!showCeilings}
					opacity={showCeilings ? 1 : 0}
					depthWrite={showCeilings}
					side={DoubleSide}
				/>
			</T.Mesh>

			{#each room.walls as wall (wall.segmentId)}
				<!-- Chord BoxGeometry strips: known visual approx at sharp bends; exact thick-wall topology deferred. -->
				{#each wall.solidSpans as span, spanIndex (`${wall.segmentId}:span:${spanIndex}`)}
					{@const section = wall.sections[span.sectionIndex]!}
					{@const dx = span.end[0] - span.start[0]}
					{@const dz = span.end[1] - span.start[1]}
					<T.Mesh
						name={`LayoutWallSection:${wall.segmentId}:${spanIndex}`}
						position={[
							(span.start[0] + span.end[0]) / 2,
							room.floorElevation + (span.bottomY + span.topY) / 2,
							(span.start[1] + span.end[1]) / 2
						]}
						rotation={[0, -Math.atan2(dz, dx), 0]}
						castShadow
						receiveShadow
					>
						<T.BoxGeometry
							args={[
								Math.max(0.001, Math.hypot(dx, dz)),
								span.topY - span.bottomY,
								wall.thickness
							]}
						/>
						<T.MeshStandardMaterial
							color={section.openingId === selectedOpeningId
								? '#f1d99a'
								: wall.segmentId === selectedSegmentId
									? '#d6b35f'
									: '#a99d89'}
							roughness={0.82}
							metalness={0}
						/>
					</T.Mesh>
				{/each}
			{/each}
		</T.Group>
	{/each}

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
