<script lang="ts">
	import { T } from '@threlte/core';
	import { DoubleSide, Shape } from 'three';
	import type { LayoutPreviewModel, LayoutRoomPreview, WallPreview } from './layout-mesh-factory';
	import { archProfileTopAt } from './arch-profile';
	import { ceilingShapePoints, floorShapePoints } from './layout-preview-geometry';
	import { pointAlongSamples } from './layout-opening-editing';
	import type { LayoutVec2 } from './layout-types';

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

	function archBottom(section: WallPreview['sections'][number], distance: number): number {
		if (!section.profile || section.profile.kind === 'rectangular') return section.bottomY;
		const localDistance = Math.max(0, Math.min(section.profile.width, distance - section.startDistance));
		const profileTop = archProfileTopAt(section.profile, localDistance);
		const profileBaseY = section.profileBaseY ?? 0;
		return Math.min(section.topY, profileBaseY + profileTop);
	}

	function clippedSpan(
		wall: WallPreview,
		section: WallPreview['sections'][number],
		distanceStart: number,
		distanceEnd: number
	): { startPoint: LayoutVec2; endPoint: LayoutVec2; midDistance: number } | null {
		const start = Math.max(distanceStart, section.startDistance);
		const end = Math.min(distanceEnd, section.endDistance);
		if (end - start <= 1e-6) return null;
		return {
			startPoint: pointAlongSamples(wall.samples, start),
			endPoint: pointAlongSamples(wall.samples, end),
			midDistance: (start + end) / 2
		};
	}
</script>

<T.Group name="LayoutPreviewRoot">
	{#each model.rooms as room (room.roomId)}
		<T.Group name={`LayoutRoom:${room.roomId}`}>
			<T.Mesh name={`LayoutFloor:${room.roomId}`} position={[0, room.floorElevation, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
				<T.ShapeGeometry args={[polygonShape(floorShapePoints(room.floorPolygon))]} />
				<T.MeshStandardMaterial color="#6b6254" roughness={0.9} metalness={0} />
			</T.Mesh>

			<T.Mesh name={`LayoutCeiling:${room.roomId}`} position={[0, room.ceilingElevation, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
				<T.ShapeGeometry args={[polygonShape(ceilingShapePoints(room.ceilingPolygon))]} />
				<T.MeshBasicMaterial color="#d8c9a6" transparent={!showCeilings} opacity={showCeilings ? 1 : 0} depthWrite={showCeilings} side={DoubleSide} />
			</T.Mesh>

			{#each room.walls as wall (wall.segmentId)}
				<!-- Chord BoxGeometry strips: known visual approx at sharp bends; exact thick-wall topology deferred. -->
				{#each wall.sections as section, sectionIndex (`${wall.segmentId}:section:${sectionIndex}`)}
					{#each wall.samples.slice(1) as sample, sampleIndex (`${wall.segmentId}:${sectionIndex}:${sampleIndex}`)}
						{@const startSample = wall.samples[sampleIndex]!}
						{@const endSample = sample}
						{@const clipped = clippedSpan(wall, section, startSample.distance, endSample.distance)}
						{#if clipped && section.topY > 0}
							{@const bottomY = section.kind === 'lintel' ? archBottom(section, clipped.midDistance) : section.bottomY}
							{#if section.topY > bottomY + 1e-6}
								<T.Mesh
									name={`LayoutWallSection:${wall.segmentId}:${sectionIndex}:${sampleIndex}`}
									position={[(clipped.startPoint[0] + clipped.endPoint[0]) / 2, room.floorElevation + (bottomY + section.topY) / 2, (clipped.startPoint[1] + clipped.endPoint[1]) / 2]}
									rotation={[0, -Math.atan2(clipped.endPoint[1] - clipped.startPoint[1], clipped.endPoint[0] - clipped.startPoint[0]), 0]}
									castShadow
									receiveShadow
								>
									<T.BoxGeometry args={[Math.max(0.001, Math.hypot(clipped.endPoint[0] - clipped.startPoint[0], clipped.endPoint[1] - clipped.startPoint[1])), section.topY - bottomY, wall.thickness]} />
									<T.MeshStandardMaterial color={section.openingId === selectedOpeningId ? '#f1d99a' : wall.segmentId === selectedSegmentId ? '#d6b35f' : '#a99d89'} roughness={0.82} metalness={0} />
								</T.Mesh>
							{/if}
						{/if}
					{/each}
				{/each}
			{/each}
		</T.Group>
	{/each}
</T.Group>
