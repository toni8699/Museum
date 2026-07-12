import type {
  MuseumConnection,
  MuseumRoom,
  MuseumRoomId,
  NavigationNodeData,
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
    accentColor: '#8c79b8',
    navigationNodeIds: ['entrance-start']
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
    accentColor: '#f0c578',
    navigationNodeIds: ['poland-threshold']
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
    accentColor: '#9fb9d1',
    navigationNodeIds: ['departure-corridor']
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
    accentColor: '#d69d65',
    navigationNodeIds: ['paris-seat']
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
    accentColor: '#b7d8ef',
    navigationNodeIds: ['workshop-desk']
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
    accentColor: '#d6b35f',
    navigationNodeIds: ['music-entry', 'music-center']
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
    accentColor: '#d5b16b',
    navigationNodeIds: ['legacy-return']
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

export const navigationNodes: NavigationNodeData[] = [
  {
    id: 'entrance-start',
    roomId: 'entrance',
    label: 'Begin: The First Note',
    position: roomPoint('entrance', [0, 1.65, 2.6]),
    cameraTarget: roomPoint('entrance', [0, 1.5, -3]),
    connectedNodeIds: ['legacy-return', 'poland-threshold'],
    nextNodeId: 'poland-threshold',
    previousNodeId: 'legacy-return'
  },
  {
    id: 'poland-threshold',
    roomId: 'poland',
    label: 'Poland: Roots',
    position: roomPoint('poland', [0, 1.65, 2.6]),
    cameraTarget: roomPoint('poland', [0, 1.35, -2]),
    connectedNodeIds: ['entrance-start', 'departure-corridor'],
    nextNodeId: 'departure-corridor',
    previousNodeId: 'entrance-start'
  },
  {
    id: 'departure-corridor',
    roomId: 'departure',
    label: 'Departure: Distance',
    position: roomPoint('departure', [3, 1.65, 4.8]),
    cameraTarget: roomPoint('departure', [3, 1.5, -5.2]),
    connectedNodeIds: ['poland-threshold', 'paris-seat'],
    nextNodeId: 'paris-seat',
    previousNodeId: 'poland-threshold'
  },
  {
    id: 'paris-seat',
    roomId: 'paris',
    label: 'Paris Salon',
    position: roomPoint('paris', [-3.6, 1.65, 0.5]),
    cameraTarget: roomPoint('paris', [1.4, 1.05, 0]),
    connectedNodeIds: ['departure-corridor', 'workshop-desk'],
    nextNodeId: 'workshop-desk',
    previousNodeId: 'departure-corridor'
  },
  {
    id: 'workshop-desk',
    roomId: 'workshop',
    label: 'Workshop: Manuscripts',
    position: roomPoint('workshop', [0, 1.65, 3]),
    cameraTarget: roomPoint('workshop', [-2.5, 1.05, -1]),
    connectedNodeIds: ['paris-seat', 'music-entry'],
    nextNodeId: 'music-entry',
    previousNodeId: 'paris-seat'
  },
  {
    id: 'music-entry',
    roomId: 'music-chamber',
    label: 'Music Chamber Entry',
    position: [3.247, 1.65, -1.875],
    cameraTarget: [0, 1.25, 0],
    connectedNodeIds: ['workshop-desk', 'music-center'],
    nextNodeId: 'music-center',
    previousNodeId: 'workshop-desk'
  },
  {
    id: 'music-center',
    roomId: 'music-chamber',
    label: 'Central Piano',
    position: [2.8, 1.65, 2.6],
    cameraTarget: [0, 1.1, 0],
    connectedNodeIds: ['music-entry', 'legacy-return'],
    nextNodeId: 'legacy-return',
    previousNodeId: 'music-entry'
  },
  {
    id: 'legacy-return',
    roomId: 'legacy',
    label: 'Legacy: Return',
    position: roomPoint('legacy', [3.7, 1.65, 0]),
    cameraTarget: roomPoint('legacy', [-1, 1.25, -2]),
    connectedNodeIds: ['music-center', 'entrance-start'],
    nextNodeId: 'entrance-start',
    previousNodeId: 'music-center'
  }
];

export const nodeById = new Map<string, NavigationNodeData>(
  navigationNodes.map((node) => [node.id, node])
);

export function getNode(id: string) {
  const node = nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}

export const navigationConnections: MuseumConnection[] = [
  {
    id: 'entrance-poland',
    fromNodeId: 'entrance-start',
    toNodeId: 'poland-threshold',
    clearance: 0.35,
    positionWaypoints: [
      getNode('entrance-start').position,
      roomPoint('entrance', [-2.2, 1.65, 1.2]),
      roomPoint('entrance', [-3.5, 1.65, 0]),
      [-5.7, 1.65, 17.1],
      roomPoint('poland', [5, 1.65, 0]),
      roomPoint('poland', [4, 1.65, 2.2]),
      getNode('poland-threshold').position
    ]
  },
  {
    id: 'poland-departure',
    fromNodeId: 'poland-threshold',
    toNodeId: 'departure-corridor',
    clearance: 0.35,
    positionWaypoints: [
      getNode('poland-threshold').position,
      roomPoint('poland', [-3.2, 1.65, 1.2]),
      roomPoint('poland', [-5, 1.65, 0]),
      [-16.4, 1.65, 6.2],
      roomPoint('departure', [4, 1.65, 0]),
      roomPoint('departure', [3, 1.65, 1.4]),
      getNode('departure-corridor').position
    ]
  },
  {
    id: 'departure-paris',
    fromNodeId: 'departure-corridor',
    toNodeId: 'paris-seat',
    clearance: 0.35,
    positionWaypoints: [
      getNode('departure-corridor').position,
      roomPoint('departure', [3, 1.65, -5.8]),
      roomPoint('departure', [-4, 1.65, -5.8]),
      [-15, 1.65, -8],
      roomPoint('paris', [6.3, 1.65, 3.5]),
      roomPoint('paris', [5.5, 1.65, 3.5]),
      roomPoint('paris', [4.7, 1.65, 3.5]),
      roomPoint('paris', [4, 1.65, 4]),
      roomPoint('paris', [-3.8, 1.65, 4]),
      getNode('paris-seat').position
    ]
  },
  {
    id: 'paris-workshop',
    fromNodeId: 'paris-seat',
    toNodeId: 'workshop-desk',
    clearance: 0.35,
    positionWaypoints: [
      getNode('paris-seat').position,
      roomPoint('paris', [-3.8, 1.65, 4]),
      roomPoint('paris', [-5.5, 1.65, 3.5]),
      [0, 1.65, -19.3],
      roomPoint('workshop', [6, 1.65, 3.2]),
      roomPoint('workshop', [4, 1.65, 3]),
      getNode('workshop-desk').position
    ]
  },
  {
    id: 'workshop-music-entry',
    fromNodeId: 'workshop-desk',
    toNodeId: 'music-entry',
    clearance: 0.35,
    positionWaypoints: [
      getNode('workshop-desk').position,
      roomPoint('workshop', [0, 1.65, -2.5]),
      roomPoint('workshop', [2.8, 1.65, -5]),
      [4.4, 1.65, -7.7],
      [4.806, 1.65, -2.775],
      [4.027, 1.65, -2.325],
      getNode('music-entry').position
    ]
  },
  {
    id: 'music-entry-center',
    fromNodeId: 'music-entry',
    toNodeId: 'music-center',
    clearance: 0.35,
    positionWaypoints: [
      getNode('music-entry').position,
      [3.4, 1.65, 0.2],
      [3.2, 1.65, 1.5],
      getNode('music-center').position
    ]
  },
  {
    id: 'music-center-legacy',
    fromNodeId: 'music-center',
    toNodeId: 'legacy-return',
    clearance: 0.35,
    positionWaypoints: [
      getNode('music-center').position,
      [3.247, 1.65, 1.875],
      [4.027, 1.65, 2.325],
      [4.806, 1.65, 2.775],
      [6.3, 1.65, 4.4],
      roomPoint('legacy', [0, 1.65, -5]),
      roomPoint('legacy', [0, 1.65, -2.4]),
      getNode('legacy-return').position
    ]
  },
  {
    id: 'legacy-entrance',
    fromNodeId: 'legacy-return',
    toNodeId: 'entrance-start',
    clearance: 0.35,
    positionWaypoints: [
      getNode('legacy-return').position,
      roomPoint('legacy', [4, 1.65, 4]),
      roomPoint('legacy', [-4, 1.65, 4]),
      roomPoint('legacy', [-5.5, 1.65, 3.2]),
      [8.5, 1.65, 18],
      roomPoint('entrance', [3.5, 1.65, 2.5]),
      getNode('entrance-start').position
    ]
  }
];
