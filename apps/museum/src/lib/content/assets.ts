import type { AssetId, MuseumAsset } from '$lib/types/assets';

export const museumAssets: MuseumAsset[] = [
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
    defaultScale: 0.032,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
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
    defaultScale: 0.92,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
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
    defaultScale: 0.9,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
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
    defaultScale: 0.21,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
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
    defaultScale: 0.45,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
    notes:
      'Ceiling-pivoted replacement (chandelier2). defaultScale 0.45 yields approximately 0.89 m × 1.48 m × 0.90 m.'
  },
  {
    id: 'paris-writing-desk',
    name: 'Paris Writing Desk',
    category: 'desk',
    productionFile: '/museum/models/furniture/writing-desk.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: true,
    receiveShadow: false,
    status: 'placeholder',
    rooms: ['paris'],
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
    defaultScale: 0.01,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
    notes:
      'The source geometry was far from its origin. Production is floor-centered and measures approximately 0.23 m × 0.54 m × 0.21 m.'
  },
  {
    id: 'paris-portrait-frame',
    name: 'Paris Portrait Frame',
    category: 'frame',
    productionFile: '/museum/models/frames/salon-portrait-frame.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    rooms: ['paris'],
    notes: 'One reusable frame reserved for five temporary portrait planes.'
  },
  {
    id: 'paris-book',
    name: 'Paris Salon Book',
    category: 'book',
    productionFile: '/museum/models/decor/book.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    rooms: ['paris'],
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
    defaultScale: 0.008,
    castShadow: false,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
    notes:
      'Floor-centered; scale 0.008 yields approximately 0.38 m × 2.11 m × 0.50 m. UVs outside [0, 1] remain unquantized.'
  },
  {
    id: 'paris-salon-rug',
    name: 'Paris Salon Rug',
    category: 'decor',
    productionFile: '/museum/models/decor/salon-rug.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: true,
    status: 'placeholder',
    rooms: ['paris'],
    notes: 'Optional low-profile fallback; keep clear of the local z=4 camera corridor.'
  }
];

export const museumAssetById = new Map<AssetId, MuseumAsset>(
  museumAssets.map((asset) => [asset.id, asset])
);

export function getMuseumAsset(id: AssetId): MuseumAsset {
  const asset = museumAssetById.get(id);
  if (!asset) throw new Error(`Unknown museum asset: ${id}`);
  return asset;
}
