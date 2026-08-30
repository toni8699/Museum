/** Opaque room ID validated against the active Project layout. */
export type RoomId = string;

export type TourMode = 'guided' | 'free';

import { CAMERA_EASING, CAMERA_FOV } from '@portfolio/camera-core';
import type {
  CameraConnectionDirection,
  CameraEasing,
  NavigationNodeData,
  RuntimeCameraFramingEnvelope,
  RuntimeCameraViewKeyframe,
  RuntimeConnection,
  RuntimeConnectionViewTracks,
  RuntimePathAnchor,
  RuntimePositionPath,
  Vec3
} from '@portfolio/project-model';

export { CAMERA_EASING, CAMERA_FOV };
export type {
  CameraConnectionDirection,
  CameraEasing,
  NavigationNodeData,
  RuntimeCameraFramingEnvelope,
  RuntimeCameraViewKeyframe,
  RuntimeConnection,
  RuntimeConnectionViewTracks,
  RuntimePathAnchor,
  RuntimePositionPath,
  Vec3
};

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

export type Room = {
  id: RoomId;
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

export type RuntimeState = {
  currentRoomId: RoomId;
  activeNodeId: string;
  targetNodeId: string | null;
  isTransitioning: boolean;
  tourMode: TourMode;
  reducedMotion: boolean;
  visitedRoomIds: Set<RoomId>;
};
