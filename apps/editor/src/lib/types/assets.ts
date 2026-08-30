import type { Vec3 } from '$lib/types/scene';

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

/**
 * The semantic surface an asset is authored to rest on.
 * `surface` means another object such as a table or pedestal.
 */
export type PlacementSurface = 'floor' | 'wall' | 'ceiling' | 'surface';

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

/** Normalized fallback value persisted by scene object placements. */
export type SceneObjectFallback = FallbackKind;

/** Canonical floor-plane bounds, relative to an asset placement pivot. */
export type AssetFootprint = {
  width: number;
  depth: number;
  /** Optional simple polygon in canonical metres; no repeated closing point. */
  outline?: readonly [number, number][];
};

export type Asset = {
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
  placementSurface: PlacementSurface;
  /** Optional canonical Plan footprint. Missing/invalid metadata is ineligible. */
  footprint?: AssetFootprint;
  defaultScale: number;
  /** Renderer-owned model orientation correction, expressed as Euler radians. */
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
  /** Scene-authoritative fallback; manifest changes must not alter existing placements. */
  fallback: SceneObjectFallback;
  position: Vec3;
  rotation: Vec3;
  scale?: number;
};
