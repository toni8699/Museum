import type { Vec3 } from '$lib/types/museum';

export type AssetId = string;

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
  productionFile?: string;
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
