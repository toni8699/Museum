export type Vec3 = [number, number, number];

/** Opaque room ID validated against the active MuseumProject layout. */
export type MuseumRoomId = string;

export type TourMode = 'guided' | 'free';

export const MUSEUM_CAMERA_FOV = {
  min: 10,
  max: 120,
  default: 54
} as const;

export type CameraConnectionDirection = 'forward' | 'reverse';

/** Phase 3.7 authored camera easing for position/hold schedules. */
export type CameraEasing =
  | 'linear'
  | 'smoothstep'
  | 'smootherstep'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

export const MUSEUM_CAMERA_EASING: readonly CameraEasing[] = [
  'linear',
  'smoothstep',
  'smootherstep',
  'ease-in',
  'ease-out',
  'ease-in-out'
] as const;

export type SceneConnectionTiming = {
  /** Motion duration in seconds. Clamped to a small positive minimum at apply-time. */
  durationSeconds?: number;
  /** Easing applied across the motion span. */
  easing?: CameraEasing;
};

export type SceneViewKeyframeTiming = {
  /** Optional zero-position-motion hold in seconds after this key, before the next. */
  holdSeconds?: number;
  /** Optional easing to apply up to the next framing sample (or end if last). */
  easing?: CameraEasing;
};

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
  /** S10.2 — detour origin marker, valid only on a chain head (no previousNodeId). */
  detourOfNodeId?: string;
  lockInteraction?: boolean;
  /** Phase 3.7 authored camera timing: zero-position-motion hold in seconds when this node is the destination of a guided edge. */
  holdSeconds?: number;
};

export type RuntimeCameraViewKeyframe = {
  id: string;
  /** Exact-edge arc-length progress in this track's travel direction. */
  progress: number;
  /** Resolved world-space look target. */
  cameraTarget: Vec3;
  /** Vertical PerspectiveCamera field of view in degrees. */
  fov: number;
  /** Phase 3.7 authored post-key hold in seconds; never applies in reduced motion. */
  holdSeconds?: number;
  /** Phase 3.7 authored easing for the arc up to the next framing sample. */
  easing?: CameraEasing;
};

export type RuntimeCameraFramingEnvelope = {
  enterStart: number;
  enterEnd: number;
  exitStart: number;
  exitEnd: number;
};

export type RuntimeConnectionViewTracks = Record<
  CameraConnectionDirection,
  RuntimeCameraViewKeyframe[]
> & {
  framingEnvelope?: Partial<
    Record<CameraConnectionDirection, RuntimeCameraFramingEnvelope>
  >;
};

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
  /** Phase 3.7 authored timing: connection-spanning motion duration + easing; per-direction. */
  timing?: {
    forward?: SceneConnectionTiming;
    reverse?: SceneConnectionTiming;
  };
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
