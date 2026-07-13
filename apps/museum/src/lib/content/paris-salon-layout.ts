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
    id: 'chair-front-left',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-0.7, 0, 1.55],
    rotation: [0, -Math.PI * 0.27, 0]
  },
  {
    id: 'chair-front-center',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [0.65, 0, 2.25],
    rotation: [0, -Math.PI * 0.09, 0]
  },
  {
    id: 'chair-front-right',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [2, 0, 2.35],
    rotation: [0, Math.PI * 0.08, 0]
  },
  {
    id: 'chair-right-side',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [3.15, 0, 0.65],
    rotation: [0, Math.PI * 0.37, 0]
  },
  {
    id: 'chair-left-side',
    assetId: 'paris-salon-chair',
    fallback: 'chair',
    position: [-0.65, 0, -1.45],
    rotation: [0, -Math.PI * 0.62, 0]
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
    id: 'publisher-clock',
    assetId: 'paris-mantel-clock',
    fallback: 'clock',
    position: [4.45, 0.77, -3.2],
    rotation: [0, 0, 0]
  }
];
