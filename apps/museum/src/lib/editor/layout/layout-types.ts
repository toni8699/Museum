import type { Vec3 } from '$lib/types/museum';

export type LayoutVec2 = [number, number];

export type LayoutDocument = {
	formatVersion: 1;
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
	boundary: DraftPath;
	wallThickness: number;
	floorThickness: number;
	ceilingThickness: number;
	openings: LayoutOpening[];
};

export type DraftPath = {
	closed: true;
	segments: DraftSegment[];
};

export type DraftSegment =
	| {
			id: string;
			kind: 'line';
			start: LayoutVec2;
			end: LayoutVec2;
	  }
	| {
			id: string;
			kind: 'bezier';
			start: LayoutVec2;
			handleOut: LayoutVec2;
			handleIn: LayoutVec2;
			end: LayoutVec2;
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
