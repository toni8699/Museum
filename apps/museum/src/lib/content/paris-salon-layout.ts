import type { AssetPlacement } from '$lib/types/assets';

export const parisSalonAssets: AssetPlacement[] = [
  {
    id: 'main-piano',
    assetId: 'paris-grand-piano',
    fallback: 'piano',
    position: [1.35, 0, -0.25],
    rotation: [0, -Math.PI * 0.08, 0]
  },
  {
    id: 'piano-rug',
    assetId: 'paris-salon-rug',
    fallback: 'rug',
    position: [1.25, 0.012, -0.2],
    rotation: [0, 0, 0]
  },
  {
    id: 'salon-chandelier',
    assetId: 'paris-chandelier',
    fallback: 'chandelier',
    position: [-0.1, 4.19, 0.65],
    rotation: [0, Math.PI * 0.08, 0]
  },
  {
    id: 'left-wall-sofa',
    assetId: 'paris-salon-sofa',
    fallback: 'sofa',
    position: [-4.92, 0, -1.7],
    rotation: [0, Math.PI / 2, 0]
  },
  {
    id: 'sofa-table',
    assetId: 'paris-salon-table',
    fallback: 'table',
    position: [-3.35, 0, -1.7],
    rotation: [0, Math.PI, 0]
  },
  {
    id: 'sofa-chair-right',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-2.42, 0, -1.7],
    rotation: [0, Math.PI * 2, 0]
  },
  {
    id: 'sofa-chair-front',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-3.35, 0, -0.72],
    rotation: [0, -Math.PI/2 , 0]
  },
  {
    id: 'front-salon-table',
    assetId: 'paris-salon-table',
    fallback: 'table',
    position: [-1.5, 0, 1.62],
    rotation: [0, Math.PI, 0]
  },
  {
    id: 'front-chair-left',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-2.43, 0, 1.62],
    rotation: [0, Math.PI , 0]
  },
  {
    id: 'front-chair-center',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-1.5, 0, 2.62],
    rotation: [0, -Math.PI/2 , 0]
  },
  {
    id: 'front-chair-right',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-0.57, 0, 1.62],
    rotation: [0, Math.PI*2 , 0]
  },
  {
    id: 'portrait-liszt',
    assetId: 'paris-portrait-frame',
    fallback: 'frame',
    position: [-3.8, 2.1, -4.88],
    rotation: [0, 0, 0]
  },
  {
    id: 'portrait-delacroix',
    assetId: 'paris-portrait-frame',
    fallback: 'frame',
    position: [-2, 2.1, -4.88],
    rotation: [0, 0, 0]
  },
  {
    id: 'portrait-viardot',
    assetId: 'paris-portrait-frame',
    fallback: 'frame',
    position: [-0.2, 2.1, -4.88],
    rotation: [0, 0, 0]
  },
  {
    id: 'portrait-sand',
    assetId: 'paris-portrait-frame',
    fallback: 'frame',
    position: [1.6, 2.1, -4.88],
    rotation: [0, 0, 0]
  },
  {
    id: 'portrait-pleyel',
    assetId: 'paris-portrait-frame',
    fallback: 'frame',
    position: [3.4, 2.1, -4.88],
    rotation: [0, 0, 0]
  },
  {
    id: 'publisher-desk',
    assetId: 'paris-writing-desk',
    fallback: 'desk',
    position: [3.85, 0, -3.25],
    rotation: [0, 0, 0]
  },
  {
    id: 'publisher-lamp',
    assetId: 'paris-table-lamp',
    fallback: 'lamp',
    position: [3.4, 0.77, -3.22],
    rotation: [0, 0, 0]
  },
  {
    id: 'publisher-books',
    assetId: 'paris-book',
    fallback: 'books',
    position: [3.85, 0.77, -3.2],
    rotation: [0, Math.PI * 0.06, 0]
  },
  {
    id: 'teaching-books',
    assetId: 'paris-book',
    fallback: 'books',
    position: [4.15, 0.77, -3.16],
    rotation: [0, -Math.PI * 0.08, 0],
    scale: 0.82
  },
  {
    id: 'back-wall-clock',
    assetId: 'paris-grandfather-clock',
    fallback: 'clock',
    position: [4.72, 0, -4.55],
    rotation: [0, 0, 0]
  }
];
