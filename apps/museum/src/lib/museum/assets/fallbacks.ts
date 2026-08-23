import type { Vec3 } from '$lib/types/scene';
import type { FallbackKind } from '$lib/types/assets';

export type AssetFallbackKind = FallbackKind | 'book' | 'decor';

/** Approximate world-space bounds in metres: [width, height, depth]. */
export const assetFallbackDimensions: Record<AssetFallbackKind, Vec3> = {
  piano: [1.5, 1, 2.25],
  chair: [0.64, 0.9, 0.54],
  sofa: [2.46, 1.01, 0.83],
  table: [0.95, 0.69, 0.95],
  chandelier: [0.89, 1.48, 0.9],
  desk: [1.4, 0.75, 0.7],
  lamp: [0.32, 0.55, 0.32],
  frame: [0.85, 1.05, 0.07],
  book: [0.18, 0.04, 0.25],
  books: [0.48, 0.15, 0.3],
  clock: [0.38, 2.11, 0.5],
  decor: [0.22, 0.38, 0.22],
  rug: [2.6, 0.015, 1.8]
};
