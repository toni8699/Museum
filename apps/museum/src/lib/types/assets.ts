import type { MuseumRoomId, Vec3 } from '$lib/types/museum';

export type AssetId =
  | 'paris-grand-piano'
  | 'paris-salon-chair'
  | 'paris-salon-sofa'
  | 'paris-salon-table'
  | 'paris-chandelier'
  | 'paris-writing-desk'
  | 'paris-table-lamp'
  | 'paris-portrait-frame'
  | 'paris-book'
  | 'paris-grandfather-clock'
  | 'paris-salon-rug';

export type AssetCategory =
  | 'piano'
  | 'chair'
  | 'sofa'
  | 'table'
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
  | 'sofa'
  | 'table'
  | 'chandelier'
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
  fallback?: FallbackKind;
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
