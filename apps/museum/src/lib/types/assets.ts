import type { MuseumRoomId, Vec3 } from '$lib/types/museum';

export type AssetId =
  | 'paris-grand-piano'
  | 'paris-salon-chair'
  | 'paris-writing-desk'
  | 'paris-table-lamp'
  | 'paris-portrait-frame'
  | 'paris-book'
  | 'paris-mantel-clock'
  | 'paris-salon-rug';

export type AssetCategory =
  | 'piano'
  | 'chair'
  | 'desk'
  | 'lamp'
  | 'frame'
  | 'book'
  | 'clock'
  | 'decor';

export type AssetStatus = 'placeholder' | 'testing' | 'approved' | 'rejected';

export type AssetLoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'fallback';

export type FallbackKind =
  | 'piano'
  | 'chair'
  | 'desk'
  | 'lamp'
  | 'frame'
  | 'books'
  | 'clock'
  | 'rug';

export type MuseumAsset = {
  id: AssetId;
  name: string;
  category: AssetCategory;
  sourceFile?: string;
  productionFile: string;
  sourceUrl?: string;
  creator?: string;
  license: string;
  attribution?: string;
  defaultScale: number;
  defaultRotation?: Vec3;
  castShadow: boolean;
  receiveShadow: boolean;
  status: AssetStatus;
  rooms: MuseumRoomId[];
  notes?: string;
};

export type AssetMetrics = {
  dimensions: Vec3;
  meshCount: number;
  materialCount: number;
  triangleCount: number;
  animationNames: string[];
};

export type AssetPlacement = {
  id: string;
  assetId: AssetId;
  fallback: FallbackKind;
  position: Vec3;
  rotation: Vec3;
  scale?: number;
};
