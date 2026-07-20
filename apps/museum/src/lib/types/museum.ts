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

export const MUSEUM_CAMERA_FOV = {
  min: 10,
  max: 120,
  default: 54
} as const;

export type CameraConnectionDirection = 'forward' | 'reverse';

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
  /** Vertical PerspectiveCamera field of view in degrees. */
  fov: number;
  connectedNodeIds: string[];
  nextNodeId?: string;
  previousNodeId?: string;
  lockInteraction?: boolean;
};

export type RuntimeCameraViewKeyframe = {
  id: string;
  /** Exact-edge arc-length progress in this track's travel direction. */
  progress: number;
  /** Resolved world-space look target. */
  cameraTarget: Vec3;
  /** Vertical PerspectiveCamera field of view in degrees. */
  fov: number;
};

export type RuntimeConnectionViewTracks = Record<
  CameraConnectionDirection,
  RuntimeCameraViewKeyframe[]
>;

export type RuntimePathAnchor = {
  /** Stable authored ID, or a resolver-owned `node:<id>:position` endpoint ID. */
  id: string;
  position: Vec3;
};

export type RuntimePositionPath =
  | {
      kind: 'rounded-polyline';
      anchors: RuntimePathAnchor[];
    }
  | {
      kind: 'auto-bezier';
      anchors: RuntimePathAnchor[];
    };

export type MuseumConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** World-space path anchors, including fresh resolver-owned node endpoints. */
  positionPath: RuntimePositionPath;
  /** Direction-specific authored framing. Endpoint views remain node-owned. */
  viewTracks?: RuntimeConnectionViewTracks;
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
