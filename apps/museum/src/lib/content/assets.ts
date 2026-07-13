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
    name: 'Paris Salon Chair',
    category: 'chair',
    sourceFile: 'assets-source/models/dining-chair-02/dining_chair_02_1k.gltf',
    productionFile: '/museum/models/furniture/dining-chair-02.glb',
    sourceUrl: 'https://polyhaven.com/a/dining_chair_02',
    creator: 'James Ray Cock / Poly Haven',
    license: 'CC0 1.0',
    attribution: 'Dining Chair 02 by Poly Haven, released under CC0 1.0.',
    defaultScale: 0.92,
    castShadow: true,
    receiveShadow: false,
    status: 'approved',
    rooms: ['paris'],
    notes:
      'Shared production model; scale 0.92 yields an approximately 0.40 m × 0.90 m × 0.53 m chair. Clone the cached scene for repeated placements.'
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
    name: 'Paris Table Lamp',
    category: 'lamp',
    productionFile: '/museum/models/decor/table-lamp.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    rooms: ['paris']
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
    id: 'paris-mantel-clock',
    name: 'Paris Mantel Clock',
    category: 'clock',
    productionFile: '/museum/models/decor/mantel-clock.glb',
    license: 'pending',
    defaultScale: 1,
    castShadow: false,
    receiveShadow: false,
    status: 'placeholder',
    rooms: ['paris']
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
