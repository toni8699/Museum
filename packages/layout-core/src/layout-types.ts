import type { Vec3 } from './types';

export type LayoutVec2 = [number, number];

export type LayoutDocument = {
  units: 'meters';
  floors: LayoutFloor[];
  objects: LayoutObject[];
};

export type LayoutFloor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  rooms: LayoutRoom[];
};

export type LayoutRoom = {
  id: string;
  name: string;
  frame: LayoutRoomFrame;
  boundary: DraftPath;
  wallThickness: number;
  floorThickness: number;
  ceilingThickness: number;
  openings: LayoutOpening[];
};

export type LayoutRoomFrame = {
  /** World/layout XZ position of room-local [0, 0, 0]. */
  origin: LayoutVec2;
  /** Three.js positive-Y yaw in radians. */
  yaw: number;
};

export type DraftPath = {
  closed: true;
  segments: DraftSegment[];
};

export type LayoutInteriorAnchor = {
  id: string;
  point: LayoutVec2;
};

export type DraftSegment =
  | { id: string; kind: 'line'; start: LayoutVec2; end: LayoutVec2 }
  | {
      id: string;
      kind: 'auto-bezier';
      start: LayoutVec2;
      end: LayoutVec2;
      interiorAnchors: LayoutInteriorAnchor[];
    };

export type LayoutOpening = {
  id: string;
  segmentId: string;
  kind: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  profile: 'rectangular' | 'rounded' | 'pointed';
  connectsRoomIds?: [string, string];
};

export type LayoutObject = {
  id: string;
  kind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  profile?: DraftPath;
  roomId?: string;
};
