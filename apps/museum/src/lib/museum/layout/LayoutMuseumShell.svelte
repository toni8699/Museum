<script lang="ts">
  import { T } from '@threlte/core';
  import { Shape } from 'three';
  import type { LayoutVec2 } from '$lib/layout/layout-types';
  import type { CompiledLayoutGeometry, CompiledSolidSpan } from '$lib/layout/layout-geometry-types';
  import type { ChopinRoomPresentation } from '$lib/content/chopin-room-presentation';
  import { neutralRoomPresentation } from '$lib/content/chopin-room-presentation';
  import MuseumMaterial from '../materials/MuseumMaterial.svelte';
  import RoomPortal from './RoomPortal.svelte';

  let {
    geometry,
    presentation,
    excludedRoomIds = []
  }: {
    geometry: CompiledLayoutGeometry;
    presentation: Readonly<Record<string, ChopinRoomPresentation>>;
    excludedRoomIds?: readonly string[];
  } = $props();

  function polygonShape(points: readonly LayoutVec2[], invertZ = true): Shape {
    const shape = new Shape();
    const first = points[0];
    if (!first) return shape;
    const mapZ = (point: LayoutVec2) => invertZ ? -point[1] : point[1];
    shape.moveTo(first[0], mapZ(first));
    for (const point of points.slice(1)) shape.lineTo(point[0], mapZ(point));
    shape.closePath();
    return shape;
  }

  function roomPresentation(roomId: string) {
    return presentation[roomId] ?? neutralRoomPresentation;
  }
</script>

<T.Group name="LayoutMuseumShell">
  {#each geometry.rooms as room (room.roomId)}
    {#if !excludedRoomIds.includes(room.roomId)}
      {@const colors = roomPresentation(room.roomId)}
      <T.Group name={`LayoutRoom:${room.roomId}`}>
        <T.Mesh
          name={`LayoutFloor:${room.roomId}`}
          position={[0, room.floorElevation, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <T.ShapeGeometry args={[polygonShape(room.floorPolygon)]} />
          <MuseumMaterial materialId="wood-walnut" surfaceSize={[8, 8]} tint={colors.color} />
        </T.Mesh>
        <T.Mesh
          name={`LayoutCeiling:${room.roomId}`}
          position={[0, room.ceilingElevation, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <T.ShapeGeometry args={[polygonShape(room.ceilingPolygon, false)]} />
          <MuseumMaterial materialId="plaster-warm" surfaceSize={[8, 8]} tint="#111018" textures="off" />
        </T.Mesh>

        {#each room.walls as wall (wall.segmentId)}
          {#each wall.solidSpans as span, spanIndex (`${wall.segmentId}:span:${spanIndex}`)}
            {@const dx = span.end[0] - span.start[0]}
            {@const dz = span.end[1] - span.start[1]}
            {@const length = Math.hypot(dx, dz)}
            <T.Mesh
              name={`LayoutWall:${room.roomId}:${wall.segmentId}:${spanIndex}`}
              position={[
                (span.start[0] + span.end[0]) / 2,
                room.floorElevation + (span.bottomY + span.topY) / 2,
                (span.start[1] + span.end[1]) / 2
              ]}
              rotation={[0, -Math.atan2(dz, dx), 0]}
              castShadow
              receiveShadow
            >
              <T.BoxGeometry args={[Math.max(0.001, length), span.topY - span.bottomY, wall.thickness]} />
              <MuseumMaterial materialId="plaster-warm" surfaceSize={[length, span.topY - span.bottomY]} tint={colors.color} textures="off" />
            </T.Mesh>
          {/each}
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
    {/if}
  {/each}
</T.Group>
