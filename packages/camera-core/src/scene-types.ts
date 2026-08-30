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

/** Structural graph input consumed by camera routing. */
export type CameraGraphNode = {
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

export type CameraViewKeyframe = {
  id: string;
  progress: number;
  cameraTarget: Vec3;
  fov: number;
  holdSeconds?: number;
  easing?: CameraEasing;
};

export type CameraFramingEnvelope = {
  enterStart: number;
  enterEnd: number;
  exitStart: number;
  exitEnd: number;
};

export type CameraConnectionViewTracks = Record<
  CameraConnectionDirection,
  CameraViewKeyframe[]
> & {
  framingEnvelope?: Partial<
    Record<CameraConnectionDirection, CameraFramingEnvelope>
  >;
};

export type CameraPathAnchor = {
  id: string;
  position: Vec3;
};

export type CameraPositionPath =
  | {
      kind: 'rounded-polyline';
      anchors: CameraPathAnchor[];
    }
  | {
      kind: 'auto-bezier';
      anchors: CameraPathAnchor[];
    };

export type CameraConnectionTiming = {
  forward?: {
    durationSeconds?: number;
    easing?: CameraEasing;
  };
  reverse?: {
    durationSeconds?: number;
    easing?: CameraEasing;
  };
};

/** Structural connection input consumed by camera routing/motion. */
export type CameraGraphConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  positionPath: CameraPositionPath;
  viewTracks?: CameraConnectionViewTracks;
  targetWaypoints?: Vec3[];
  clearance: number;
  timing?: CameraConnectionTiming;
};
