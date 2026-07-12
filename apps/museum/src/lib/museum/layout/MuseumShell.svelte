<script lang="ts">
  import { T } from '@threlte/core';
  import type { MuseumRoom, RoomOpening, RoomOpeningSide, Vec3 } from '$lib/types/museum';
  import RoomPortal from './RoomPortal.svelte';

  let { rooms }: { rooms: MuseumRoom[] } = $props();

  const wallThickness = 0.16;
  const floorThickness = 0.08;

  type WallSegment = {
    id: string;
    position: Vec3;
    size: Vec3;
  };

  function wallSegment(
    room: MuseumRoom,
    side: RoomOpeningSide,
    coordinate: number,
    length: number,
    height: number,
    y: number,
    suffix: string
  ): WallSegment {
    const [width, , depth] = room.dimensions;
    const alongX = side === 'neg-z' || side === 'pos-z';
    const fixedCoordinate =
      side === 'neg-x'
        ? -width / 2
        : side === 'pos-x'
          ? width / 2
          : side === 'neg-z'
            ? -depth / 2
            : depth / 2;

    return {
      id: `${room.id}-${side}-${suffix}`,
      position: alongX ? [coordinate, y, fixedCoordinate] : [fixedCoordinate, y, coordinate],
      size: alongX
        ? [length, height, wallThickness]
        : [wallThickness, height, length]
    };
  }

  function buildWall(room: MuseumRoom, side: RoomOpeningSide): WallSegment[] {
    const [width, height, depth] = room.dimensions;
    const length = side === 'neg-z' || side === 'pos-z' ? width : depth;
    const opening = room.openings.find((candidate) => candidate.side === side);

    if (!opening) {
      return [wallSegment(room, side, 0, length, height, height / 2, 'full')];
    }

    const offset = opening.offset ?? 0;
    const openingStart = Math.max(-length / 2, offset - opening.width / 2);
    const openingEnd = Math.min(length / 2, offset + opening.width / 2);
    const beforeLength = openingStart + length / 2;
    const afterLength = length / 2 - openingEnd;
    const topHeight = Math.max(0, height - opening.height);
    const segments: WallSegment[] = [];

    if (beforeLength > 0.01) {
      segments.push(
        wallSegment(
          room,
          side,
          -length / 2 + beforeLength / 2,
          beforeLength,
          height,
          height / 2,
          'before'
        )
      );
    }

    if (afterLength > 0.01) {
      segments.push(
        wallSegment(
          room,
          side,
          openingEnd + afterLength / 2,
          afterLength,
          height,
          height / 2,
          'after'
        )
      );
    }

    if (topHeight > 0.01) {
      segments.push(
        wallSegment(
          room,
          side,
          (openingStart + openingEnd) / 2,
          openingEnd - openingStart,
          topHeight,
          opening.height + topHeight / 2,
          'top'
        )
      );
    }

    return segments;
  }

  function buildRoomWalls(room: MuseumRoom) {
    return (['neg-x', 'pos-x', 'neg-z', 'pos-z'] as RoomOpeningSide[]).flatMap((side) =>
      buildWall(room, side)
    );
  }

  function portalTransform(room: MuseumRoom, opening: RoomOpening) {
    const [width, , depth] = room.dimensions;
    const offset = opening.offset ?? 0;

    if (opening.side === 'neg-x') {
      return { position: [-width / 2, 0, offset] as Vec3, rotation: [0, Math.PI / 2, 0] as Vec3 };
    }
    if (opening.side === 'pos-x') {
      return { position: [width / 2, 0, offset] as Vec3, rotation: [0, Math.PI / 2, 0] as Vec3 };
    }
    if (opening.side === 'neg-z') {
      return { position: [offset, 0, -depth / 2] as Vec3, rotation: [0, 0, 0] as Vec3 };
    }
    return { position: [offset, 0, depth / 2] as Vec3, rotation: [0, 0, 0] as Vec3 };
  }
</script>

<T.Group>
  <T.Mesh position={[0, -0.08, 0]}>
    <T.CylinderGeometry args={[22, 22, 0.05, 96]} />
    <T.MeshStandardMaterial color="#0e0d11" roughness={0.92} />
  </T.Mesh>

  {#each rooms as room (room.id)}
    {#if room.id !== 'music-chamber'}
      {@const [width, height, depth] = room.dimensions}
      {@const wallSegments = buildRoomWalls(room)}
      <T.Group position={room.position} rotation={room.rotation}>
        <T.Mesh position={[0, floorThickness / 2, 0]}>
          <T.BoxGeometry args={[width, floorThickness, depth]} />
          <T.MeshStandardMaterial color={room.color} roughness={0.88} metalness={0.02} />
        </T.Mesh>
        <T.Mesh position={[0, height + floorThickness / 2, 0]}>
          <T.BoxGeometry args={[width, floorThickness, depth]} />
          <T.MeshStandardMaterial color="#111018" roughness={0.95} />
        </T.Mesh>

        {#each wallSegments as segment (segment.id)}
          <T.Mesh position={segment.position}>
            <T.BoxGeometry args={segment.size} />
            <T.MeshStandardMaterial color={room.color} roughness={0.9} metalness={0.01} />
          </T.Mesh>
        {/each}

        {#each room.openings as opening (opening.id)}
          {#if opening.showPortal ?? opening.kind === 'door'}
            {@const transform = portalTransform(room, opening)}
            <RoomPortal
              position={transform.position}
              rotation={transform.rotation}
              width={opening.width}
              height={opening.height}
              color={room.accentColor}
            />
          {/if}
        {/each}
      </T.Group>
    {/if}
  {/each}
</T.Group>
