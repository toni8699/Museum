import type {
  MuseumRoom,
  MuseumRoomId,
  Vec3
} from '$lib/types/museum';

export const museumRooms: MuseumRoom[] = [
  {
    id: 'entrance',
    title: 'Entrance',
    subtitle: 'The First Note',
    mood: 'Dark, narrow, anticipatory',
    position: [0, 0, 18],
    rotation: [0, 0, 0],
    dimensions: [7, 4.2, 8],
    openings: [
      { id: 'entrance-from-legacy', side: 'pos-x', offset: 2.5, width: 2.4, height: 3.35, kind: 'door' },
      { id: 'entrance-to-poland', side: 'neg-x', width: 2.6, height: 3.35, kind: 'door' },
      { id: 'entrance-chamber-view', side: 'neg-z', width: 3.2, height: 3.2, kind: 'sightline' }
    ],
    color: '#1b1824',
    accentColor: '#8c79b8'
  },
  {
    id: 'poland',
    title: 'Poland',
    subtitle: 'Roots and Early Voice',
    mood: 'Warm domestic amber',
    position: [-12, 0, 12],
    rotation: [0, -Math.PI / 4, 0],
    dimensions: [10, 4.2, 9],
    openings: [
      { id: 'poland-from-entrance', side: 'pos-x', width: 2.6, height: 3.35, kind: 'door' },
      { id: 'poland-to-departure', side: 'neg-x', width: 2.6, height: 3.35, kind: 'door' },
      { id: 'poland-chamber-view', side: 'neg-z', width: 2.8, height: 3.05, kind: 'sightline' }
    ],
    color: '#7a4f28',
    accentColor: '#f0c578'
  },
  {
    id: 'departure',
    title: 'Departure',
    subtitle: 'Distance From Home',
    mood: 'Long, blue-grey, distant',
    position: [-17, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
    dimensions: [8, 4.2, 14],
    openings: [
      { id: 'departure-from-poland', side: 'pos-x', width: 2.6, height: 3.35, kind: 'door' },
      { id: 'departure-to-paris', side: 'neg-x', offset: -5.8, width: 2.4, height: 3.35, kind: 'door' },
      { id: 'departure-chamber-view', side: 'neg-z', width: 2.8, height: 3.05, kind: 'sightline' }
    ],
    color: '#334456',
    accentColor: '#9fb9d1'
  },
  {
    id: 'paris',
    title: 'Paris Salon',
    subtitle: 'Artist, Teacher, Performer',
    mood: 'Intimate velvet and candlelight',
    position: [-10, 0, -13],
    rotation: [0, Math.atan2(-10, -13), 0],
    dimensions: [11, 4.2, 10],
    openings: [
      { id: 'paris-from-departure', side: 'pos-x', offset: 3.5, width: 2.6, height: 3.35, kind: 'door' },
      { id: 'paris-to-workshop', side: 'neg-x', offset: 3.5, width: 2.6, height: 3.35, kind: 'door' }
    ],
    color: '#56313a',
    accentColor: '#d69d65'
  },
  {
    id: 'workshop',
    title: 'Workshop',
    subtitle: 'Composition and Nohant',
    mood: 'Sunlit studio dissolving into abstraction',
    position: [10, 0, -13],
    rotation: [0, Math.atan2(10, -13), 0],
    dimensions: [12, 4.2, 10],
    openings: [
      { id: 'workshop-from-paris', side: 'pos-x', offset: 3.2, width: 2.6, height: 3.35, kind: 'door' },
      { id: 'workshop-to-chamber', side: 'neg-z', offset: 2.8, width: 2.8, height: 3.35, kind: 'door' }
    ],
    color: '#8d816b',
    accentColor: '#b7d8ef'
  },
  {
    id: 'music-chamber',
    title: 'Music Chamber',
    subtitle: 'Chopin Through Form',
    mood: 'Circular, focused, luminous',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: [11, 4.2, 11],
    openings: [],
    color: '#17151c',
    accentColor: '#d6b35f'
  },
  {
    id: 'legacy',
    title: 'Legacy',
    subtitle: 'Continuing Music',
    mood: 'Pale, sparse, brightening',
    position: [13, 0, 10],
    rotation: [0, Math.atan2(13, 10), 0],
    dimensions: [11, 4.2, 10],
    openings: [
      { id: 'legacy-from-chamber', side: 'neg-z', width: 2.8, height: 3.35, kind: 'door' },
      { id: 'legacy-to-entrance', side: 'neg-x', offset: 3.2, width: 2.6, height: 3.35, kind: 'door' }
    ],
    color: '#d8d7d1',
    accentColor: '#d5b16b'
  }
];

export const roomById = new Map<MuseumRoomId, MuseumRoom>(museumRooms.map((room) => [room.id, room]));

export function getRoom(id: MuseumRoomId) {
  const room = roomById.get(id);
  if (!room) throw new Error(`Unknown museum room: ${id}`);
  return room;
}

export function roomPoint(roomId: MuseumRoomId, localPoint: Vec3): Vec3 {
  const room = getRoom(roomId);
  const yaw = room.rotation[1];
  const [localX, localY, localZ] = localPoint;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  return [
    room.position[0] + localX * cos + localZ * sin,
    room.position[1] + localY,
    room.position[2] - localX * sin + localZ * cos
  ];
}

export function roomLocalPoint(roomId: MuseumRoomId, worldPoint: Vec3): Vec3 {
  const room = getRoom(roomId);
  const yaw = room.rotation[1];
  const deltaX = worldPoint[0] - room.position[0];
  const deltaZ = worldPoint[2] - room.position[2];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  return [
    deltaX * cos - deltaZ * sin,
    worldPoint[1] - room.position[1],
    deltaX * sin + deltaZ * cos
  ];
}

export function isWorldPointInsideRoomXZ(
  roomId: MuseumRoomId,
  worldPoint: Vec3,
  epsilon = 1e-6
): boolean {
  const room = getRoom(roomId);
  const [localX, , localZ] = roomLocalPoint(roomId, worldPoint);
  const halfWidth = room.dimensions[0] / 2;
  const halfDepth = room.dimensions[2] / 2;

  return (
    localX >= -halfWidth - epsilon &&
    localX <= halfWidth + epsilon &&
    localZ >= -halfDepth - epsilon &&
    localZ <= halfDepth + epsilon
  );
}
