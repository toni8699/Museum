export type Vec3 = [number, number, number];

export type MuseumRoomId =
  | 'entrance'
  | 'poland'
  | 'departure'
  | 'paris'
  | 'workshop'
  | 'music-chamber'
  | 'legacy';

export type TourMode = 'guided' | 'free';

export type RoomOpeningSide = 'neg-x' | 'pos-x' | 'neg-z' | 'pos-z';

export type RoomOpening = {
  id: string;
  side: RoomOpeningSide;
  offset?: number;
  width: number;
  height: number;
  kind: 'door' | 'sightline';
  showPortal?: boolean;
};

export type NavigationNodeData = {
  id: string;
  roomId: MuseumRoomId;
  label: string;
  position: Vec3;
  cameraTarget: Vec3;
  connectedNodeIds: string[];
  nextNodeId?: string;
  previousNodeId?: string;
  lockInteraction?: boolean;
};

export type MuseumConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  positionWaypoints: Vec3[];
  targetWaypoints?: Vec3[];
  clearance: number;
};

export type MuseumRoom = {
  id: MuseumRoomId;
  title: string;
  subtitle?: string;
  mood: string;
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  openings: RoomOpening[];
  color: string;
  accentColor: string;
  navigationNodeIds: string[];
};

export type MuseumState = {
  currentRoomId: MuseumRoomId;
  activeNodeId: string;
  targetNodeId: string | null;
  isTransitioning: boolean;
  tourMode: TourMode;
  reducedMotion: boolean;
  visitedRoomIds: Set<MuseumRoomId>;
};
