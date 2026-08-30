export type Vec3 = [number, number, number];

export const CAMERA_FOV = {
  min: 10,
  max: 120,
  default: 54
} as const;

export type CameraConnectionDirection = 'forward' | 'reverse';

/** Authored camera easing for position/hold schedules. */
export type CameraEasing =
  | 'linear'
  | 'smoothstep'
  | 'smootherstep'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

export const CAMERA_EASING: readonly CameraEasing[] = [
  'linear',
  'smoothstep',
  'smootherstep',
  'ease-in',
  'ease-out',
  'ease-in-out'
] as const;

/** TEMPORARY TYPE HOME → project-model. Keep this structural in P15. */
export type NavigationNodeData = {
  id: string;
  roomId: string;
  label: string;
  position: Vec3;
  cameraTarget: Vec3;
  fov: number;
  connectedNodeIds: string[];
  nextNodeId?: string;
  previousNodeId?: string;
  detourOfNodeId?: string;
  lockInteraction?: boolean;
  holdSeconds?: number;
};

/** TEMPORARY TYPE HOME → project-model. Runtime view data stays structural. */
export type RuntimeCameraViewKeyframe = {
  id: string;
  progress: number;
  cameraTarget: Vec3;
  fov: number;
  holdSeconds?: number;
  easing?: CameraEasing;
};

/** TEMPORARY TYPE HOME → project-model. */
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

/** TEMPORARY TYPE HOME → project-model. Only camera-consumed fields live here. */
export type RuntimeConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  positionPath: RuntimePositionPath;
  viewTracks?: RuntimeConnectionViewTracks;
  targetWaypoints?: Vec3[];
  clearance: number;
  timing?: {
    forward?: {
      durationSeconds?: number;
      easing?: CameraEasing;
    };
    reverse?: {
      durationSeconds?: number;
      easing?: CameraEasing;
    };
  };
};
