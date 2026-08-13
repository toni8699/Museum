<script lang="ts">
  import { T } from '@threlte/core';
  import { DoubleSide, Shape } from 'three';
  import type { LayoutDocument, LayoutOpening, LayoutVec2 } from '$lib/layout/layout-types';
  import {
    buildLayoutArchitectureModel,
    pointAlongLayoutSamples,
    type LayoutArchitectureRoom,
    type LayoutArchitectureWall,
    type LayoutArchitectureSection
  } from '$lib/layout/layout-architecture';
  import type { ChopinRoomPresentation } from '$lib/content/chopin-room-presentation';
  import { neutralRoomPresentation } from '$lib/content/chopin-room-presentation';
  import MuseumMaterial from '../materials/MuseumMaterial.svelte';
  import RoomPortal from './RoomPortal.svelte';

  let {
    layout,
    presentation,
    excludedRoomIds = []
  }: {
    layout: LayoutDocument;
    presentation: Readonly<Record<string, ChopinRoomPresentation>>;
    excludedRoomIds?: readonly string[];
  } = $props();
  const model = $derived(buildLayoutArchitectureModel(layout));

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

  function clippedSpan(wall: LayoutArchitectureWall, section: LayoutArchitectureSection, start: number, end: number) {
    const clippedStart = Math.max(start, section.startDistance);
    const clippedEnd = Math.min(end, section.endDistance);
    if (clippedEnd <= clippedStart + 1e-6) return null;
    return {
      start: pointAlongLayoutSamples(wall.samples, clippedStart),
      end: pointAlongLayoutSamples(wall.samples, clippedEnd)
    };
  }

  function openingPoint(wall: LayoutArchitectureWall, opening: LayoutOpening): { point: LayoutVec2; yaw: number } {
    const center = opening.offset + opening.width / 2;
    const point = pointAlongLayoutSamples(wall.samples, center);
    const before = pointAlongLayoutSamples(wall.samples, Math.max(0, center - 0.01));
    const after = pointAlongLayoutSamples(wall.samples, Math.min(wall.length, center + 0.01));
    return { point, yaw: -Math.atan2(after[1] - before[1], after[0] - before[0]) };
  }

  function roomPresentation(roomId: string) {
    return presentation[roomId] ?? neutralRoomPresentation;
  }
</script>

<T.Group name="LayoutMuseumShell">
  {#each model.rooms as room (room.roomId)}
    {#if !excludedRoomIds.includes(room.roomId)}
      {@const colors = roomPresentation(room.roomId)}
      {@const layoutRoom = layout.floors.flatMap((floor) => floor.rooms).find((candidate) => candidate.id === room.roomId)}
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
          {#each wall.sections as section, sectionIndex (`${wall.segmentId}:section:${sectionIndex}`)}
            {#each wall.samples.slice(1) as sample, sampleIndex (`${wall.segmentId}:${sectionIndex}:${sampleIndex}`)}
              {@const startSample = wall.samples[sampleIndex]!}
              {@const span = clippedSpan(wall, section, startSample.distance, sample.distance)}
              {#if span && section.topY > section.bottomY + 1e-6}
                {@const dx = span.end[0] - span.start[0]}
                {@const dz = span.end[1] - span.start[1]}
                {@const length = Math.hypot(dx, dz)}
                <T.Mesh
                  name={`LayoutWall:${room.roomId}:${wall.segmentId}:${sectionIndex}:${sampleIndex}`}
                  position={[
                    (span.start[0] + span.end[0]) / 2,
                    room.floorElevation + (section.bottomY + section.topY) / 2,
                    (span.start[1] + span.end[1]) / 2
                  ]}
                  rotation={[0, -Math.atan2(dz, dx), 0]}
                  castShadow
                  receiveShadow
                >
                  <T.BoxGeometry args={[length, section.topY - section.bottomY, wall.thickness]} />
                  <MuseumMaterial materialId="plaster-warm" surfaceSize={[length, section.topY - section.bottomY]} tint={colors.color} textures="off" />
                </T.Mesh>
              {/if}
            {/each}
          {/each}
          {#each layoutRoom?.openings.filter((opening) => opening.segmentId === wall.segmentId && opening.kind === 'door') ?? [] as opening (opening.id)}
            {@const transform = openingPoint(wall, opening)}
            <RoomPortal
              position={[transform.point[0], room.floorElevation, transform.point[1]]}
              rotation={[0, transform.yaw, 0]}
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
