import type {
  AssetCategory,
  AssetId,
  AssetStatus,
  FallbackKind,
  Asset,
  AssetFootprint,
  PlacementSurface,
  SceneObjectFallback
} from '$lib/types/assets';

export const assets: Asset[] = [
  {
    id: 'paris-grand-piano',
    name: 'Paris Salon Grand Piano',
    category: 'piano',
    sourceFile: 'assets-source/models/grand-piano.glb',
    productionFile: '/museum/models/piano/grand-piano.glb',
    sourceUrl: 'https://sketchfab.com/3d-models/grand-piano-371090c279ff4e77a59acdebc25b5892',
    creator: 'farhad.Guli',
    license: 'CC BY 4.0',
    attribution: 'Grand Piano by farhad.Guli, licensed under CC BY 4.0.',
    placementSurface: 'floor',
    footprint: { width: 1.48, depth: 1.59 },
    defaultScale: 0.032,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Source units are unusually large. The production GLB is centered at a floor pivot; scale 0.032 yields an approximately 1.48 m × 1.59 m × 2.52 m open-lid piano.'
  },
  {
    id: 'paris-salon-chair',
    name: 'Upholstered Paris Salon Chair',
    category: 'chair',
    sourceFile: 'assets-source/models/salon-chair/source.glb',
    productionFile: '/museum/models/furniture/chair/salon-chair.glb',
    sourceUrl: 'https://sketchfab.com/3d-models/chair-02f920ac307b47dda8d6fa14e5fe1da5',
    creator: 'shuvalov.di',
    license: 'CC BY-SA 4.0',
    attribution:
      'Chair by shuvalov.di, licensed under CC BY-SA 4.0. Modified for the museum: floor-centered pivot, geometry optimization, WebP textures, and Meshopt compression.',
    placementSurface: 'floor',
    footprint: { width: 0.64, depth: 0.54 },
    defaultScale: 0.92,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Replaces Dining Chair 02. Scale 0.92 yields an approximately 0.64 m × 0.90 m × 0.54 m chair. The optimized derivative remains CC BY-SA 4.0.'
  },
  {
    id: 'paris-salon-sofa',
    name: 'Paris Salon Sofa 03',
    category: 'sofa',
    sourceFile: 'assets-source/models/sofa-03/sofa_03_1k_gltf/sofa_03_1k.gltf',
    productionFile: '/museum/models/furniture/sofa/sofa-03.glb',
    sourceUrl: 'https://polyhaven.com/a/sofa_03',
    creator: 'Fran Calvente / Poly Haven',
    license: 'CC0 1.0',
    attribution: 'Sofa 03 by Fran Calvente / Poly Haven, released under CC0 1.0.',
    placementSurface: 'floor',
    footprint: { width: 2.46, depth: 0.83 },
    defaultScale: 0.9,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Official 1K glTF source set. Tangents were generated before optimization; scale 0.9 yields approximately 2.46 m × 1.01 m × 0.83 m.'
  },
  {
    id: 'paris-salon-table',
    name: 'Round Paris Salon Table',
    category: 'table',
    sourceFile: 'assets-source/models/salon-table/source.glb',
    productionFile: '/museum/models/furniture/table/salon-table.glb',
    sourceUrl: 'https://sketchfab.com/3d-models/table-1132fa2850a24917892733566bd68e74',
    creator: 'yryabchenko',
    license: 'CC BY 4.0',
    attribution: 'Table by yryabchenko, licensed under CC BY 4.0.',
    placementSurface: 'floor',
    footprint: { width: 0.95, depth: 0.95 },
    defaultScale: 0.21,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Floor-centered and scaled into a compact salon table, approximately 0.95 m × 0.69 m × 0.95 m.'
  },
  {
    id: 'paris-chandelier',
    name: 'Paris Salon Chandelier',
    category: 'decor',
    sourceFile: 'assets-source/models/chandelier/source.glb',
    productionFile: '/museum/models/decor/chandelier/chandelier2.glb',
    sourceUrl:
      'https://sketchfab.com/3d-models/chandelier-a2209f4e95de4ea6b76d0523c3eff86c',
    creator: 'myhalchuk2000',
    license: 'CC BY 4.0',
    attribution: 'Chandelier by myhalchuk2000, licensed under CC BY 4.0.',
    fallback: 'chandelier',
    placementSurface: 'ceiling',
    defaultScale: 0.45,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Ceiling-pivoted replacement (chandelier2). defaultScale 0.45 yields approximately 0.89 m × 1.48 m × 0.90 m.'
  },
  {
    id: 'paris-writing-desk',
    name: 'Paris Writing Desk',
    category: 'desk',
    productionFile: '/museum/models/furniture/writing-desk.glb',
    license: 'pending',
    placementSurface: 'floor',
    footprint: { width: 1.4, depth: 0.7 },
    defaultScale: 1,
    castShadow: true,
    receiveShadow: false,
    status: 'placeholder',
    notes: 'Primitive fallback reserves a 1.4 m by 0.7 m publisher desk footprint.'
  },
  {
    id: 'paris-table-lamp',
    name: 'Victorian Brass Oil Lamp',
    category: 'lamp',
    sourceFile: 'assets-source/models/victorian-oil-lamp/source.glb',
    productionFile: '/museum/models/decor/oil-lamp/victorian-oil-lamp.glb',
    sourceUrl:
      'https://sketchfab.com/3d-models/victorian-brass-oil-lamp-c932f6165fef40029c3f18afe19b9934',
    creator: 'Tijerín Art Studio',
    license: 'CC BY 4.0',
    attribution: 'Victorian Brass Oil Lamp by Tijerín Art Studio, licensed under CC BY 4.0.',
    placementSurface: 'surface',
    defaultScale: 0.01,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    notes:
      'The source geometry was far from its origin. Production is floor-centered and measures approximately 0.23 m × 0.54 m × 0.21 m.'
  },
  {
    id: 'paris-portrait-frame',
    name: 'Paris Portrait Frame',
    category: 'frame',
    productionFile: '/museum/models/frames/salon-portrait-frame.glb',
    license: 'pending',
    placementSurface: 'wall',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    notes: 'One reusable frame reserved for five temporary portrait planes.'
  },
  {
    id: 'paris-book',
    name: 'Paris Salon Book',
    category: 'book',
    productionFile: '/museum/models/decor/book.glb',
    license: 'pending',
    placementSurface: 'surface',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    notes: 'Repeated in small groups; do not create a unique model for each book.'
  },
  {
    id: 'paris-grandfather-clock',
    name: 'Paris Grandfather Clock',
    category: 'clock',
    sourceFile: 'assets-source/models/grandfather-clock/source.glb',
    productionFile: '/museum/models/decor/clock/grandfather-clock.glb',
    sourceUrl:
      'https://sketchfab.com/3d-models/grandfather-clock-cef39f1bd3df43578236f273f273a873',
    creator: 'Lyskilde',
    license: 'CC BY 4.0',
    attribution: 'Grandfather Clock by Lyskilde, licensed under CC BY 4.0.',
    placementSurface: 'floor',
    footprint: { width: 0.38, depth: 0.5 },
    defaultScale: 0.008,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    notes:
      'Floor-centered; scale 0.008 yields approximately 0.38 m × 2.11 m × 0.50 m. UVs outside [0, 1] remain unquantized.'
  },
  {
    id: 'paris-salon-rug',
    name: 'Paris Salon Rug',
    category: 'decor',
    productionFile: '/museum/models/decor/salon-rug.glb',
    license: 'pending',
    placementSurface: 'floor',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: true,
    status: 'placeholder',
    notes: 'Optional low-profile fallback; keep clear of the local z=4 camera corridor.'
  }
];

const assetById = new Map<string, Asset>(
  assets.map((asset) => [asset.id, asset])
);

const assetCategories: readonly AssetCategory[] = [
  'piano', 'chair', 'sofa', 'table', 'desk', 'lamp', 'frame', 'book', 'clock', 'decor'
];
const assetStatuses: readonly AssetStatus[] = ['placeholder', 'testing', 'approved', 'rejected'];
const fallbackKinds: readonly FallbackKind[] = [
  'piano', 'chair', 'sofa', 'table', 'chandelier', 'desk', 'lamp', 'frame', 'books', 'clock', 'rug'
];
const placementSurfaces: readonly PlacementSurface[] = ['floor', 'wall', 'ceiling', 'surface'];
const FOOTPRINT_EPSILON = 1e-9;

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T);
}

/** Return signed doubled area; positive means counter-clockwise in X/Z. */
export function assetFootprintSignedArea(outline: readonly [number, number][]): number {
  let area = 0;
  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index]!;
    const next = outline[(index + 1) % outline.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area;
}

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number]
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(
  a: readonly [number, number],
  b: readonly [number, number],
  point: readonly [number, number]
): boolean {
  return (
    Math.abs(orientation(a, b, point)) <= FOOTPRINT_EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - FOOTPRINT_EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + FOOTPRINT_EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - FOOTPRINT_EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + FOOTPRINT_EPSILON
  );
}

function segmentsIntersect(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number]
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > FOOTPRINT_EPSILON && abD < -FOOTPRINT_EPSILON) ||
      (abC < -FOOTPRINT_EPSILON && abD > FOOTPRINT_EPSILON)) &&
    ((cdA > FOOTPRINT_EPSILON && cdB < -FOOTPRINT_EPSILON) ||
      (cdA < -FOOTPRINT_EPSILON && cdB > FOOTPRINT_EPSILON))
  ) {
    return true;
  }
  return (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

/** Validate canonical footprint metadata without silently repairing it. */
export function validateAssetFootprint(footprint: AssetFootprint | undefined): string | null {
  if (!footprint) return 'Footprint metadata is required';
  if (!Number.isFinite(footprint.width) || footprint.width <= 0) {
    return 'Footprint width must be finite and greater than zero';
  }
  if (!Number.isFinite(footprint.depth) || footprint.depth <= 0) {
    return 'Footprint depth must be finite and greater than zero';
  }
  if (footprint.outline === undefined) return null;
  if (footprint.outline.length < 3) return 'Footprint outline must contain at least three points';
  for (const point of footprint.outline) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      return 'Footprint outline points must be finite [x, z] pairs';
    }
  }
  const first = footprint.outline[0]!;
  const last = footprint.outline.at(-1)!;
  if (
    Math.abs(first[0] - last[0]) <= FOOTPRINT_EPSILON &&
    Math.abs(first[1] - last[1]) <= FOOTPRINT_EPSILON
  ) {
    return 'Footprint outline must not repeat its first point as a closing point';
  }
  if (Math.abs(assetFootprintSignedArea(footprint.outline)) <= FOOTPRINT_EPSILON) {
    return 'Footprint outline must enclose a non-zero area';
  }
  for (let firstIndex = 0; firstIndex < footprint.outline.length; firstIndex += 1) {
    const firstEnd = (firstIndex + 1) % footprint.outline.length;
    for (let secondIndex = firstIndex + 1; secondIndex < footprint.outline.length; secondIndex += 1) {
      const secondEnd = (secondIndex + 1) % footprint.outline.length;
      const adjacent = firstEnd === secondIndex || secondEnd === firstIndex;
      if (adjacent) continue;
      if (
        segmentsIntersect(
          footprint.outline[firstIndex]!,
          footprint.outline[firstEnd]!,
          footprint.outline[secondIndex]!,
          footprint.outline[secondEnd]!
        )
      ) {
        return 'Footprint outline must be a simple polygon';
      }
    }
  }
  return null;
}

/** Return normalized outline winding while preserving canonical points. */
export function normalizeAssetFootprintOutline(
  footprint: AssetFootprint
): readonly [number, number][] {
  if (footprint.outline === undefined) {
    const halfWidth = footprint.width / 2;
    const halfDepth = footprint.depth / 2;
    return [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth]
    ];
  }
  return assetFootprintSignedArea(footprint.outline) < 0
    ? [
        footprint.outline[0]!,
        ...[...footprint.outline].slice(1).reverse()
      ].map(([x, z]) => [x, z] as [number, number])
    : footprint.outline.map(([x, z]) => [x, z] as [number, number]);
}

export function isSceneObjectFallback(value: unknown): value is SceneObjectFallback {
  return typeof value === 'string' && isOneOf(value, fallbackKinds);
}

/**
 * Normalize manifest fallback metadata into the scalar value persisted by scene objects.
 * The input asset is never mutated.
 */
export function resolveAssetFallback(asset: Asset): SceneObjectFallback {
  if (asset.fallback !== undefined) {
    if (!isSceneObjectFallback(asset.fallback)) {
      throw new Error(`Invalid fallback for asset: ${asset.id}`);
    }
    return asset.fallback;
  }

  if (asset.category === 'book') return 'books';
  if (asset.category === 'decor') return 'rug';
  if (isSceneObjectFallback(asset.category)) return asset.category;
  throw new Error(`Asset has no valid fallback mapping: ${asset.id}`);
}

export function validateAssetManifest(manifest: readonly Asset[] = assets): void {
  const ids = new Set<string>();
  for (const asset of manifest) {
    if (!asset.id.trim()) throw new Error('Asset IDs must be non-empty');
    if (ids.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    if (!isOneOf(asset.category, assetCategories)) throw new Error(`Invalid asset category: ${asset.category}`);
    if (!isOneOf(asset.status, assetStatuses)) throw new Error(`Invalid asset status: ${asset.status}`);
    if (!isOneOf(asset.placementSurface, placementSurfaces)) {
      throw new Error(`Invalid placement surface for asset: ${asset.id}`);
    }
    if (!Number.isFinite(asset.defaultScale) || asset.defaultScale <= 0) {
      throw new Error(`Invalid default scale for asset: ${asset.id}`);
    }
    if (
      asset.defaultRotation &&
      (asset.defaultRotation.length !== 3 || asset.defaultRotation.some((value) => !Number.isFinite(value)))
    ) {
      throw new Error(`Invalid default rotation for asset: ${asset.id}`);
    }
    const footprintIssue = asset.footprint === undefined ? null : validateAssetFootprint(asset.footprint);
    if (footprintIssue) throw new Error(`Invalid footprint for asset ${asset.id}: ${footprintIssue}`);
    if (asset.fallback && !isOneOf(asset.fallback, fallbackKinds)) {
      throw new Error(`Invalid fallback for asset: ${asset.id}`);
    }
    resolveAssetFallback(asset);
    if (asset.status === 'approved' && !asset.productionFile?.trim()) {
      throw new Error(`Approved asset requires a production file: ${asset.id}`);
    }
    if (!asset.productionFile?.trim() && !asset.fallback) {
      throw new Error(`Asset without a production file requires a fallback: ${asset.id}`);
    }
  }
}

validateAssetManifest();

export type AssetFilters = {
  query?: string;
  category?: AssetCategory;
  status?: AssetStatus;
};

export function listAssets(filters: AssetFilters = {}): Asset[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  return assets.filter((asset) => {
    if (filters.category && asset.category !== filters.category) return false;
    if (filters.status && asset.status !== filters.status) return false;
    if (!query) return true;
    return [asset.id, asset.name, asset.category].some((value) =>
      value.toLocaleLowerCase().includes(query)
    );
  });
}

export function getAssetById(id: string): Asset | undefined {
  return assetById.get(id);
}

export function getAsset(id: AssetId): Asset {
  const asset = getAssetById(id);
  if (!asset) throw new Error(`Unknown asset: ${id}`);
  return asset;
}
