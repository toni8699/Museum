import type { Vec3 } from '$lib/types/museum';
import type { FallbackKind } from '$lib/types/assets';

export type AssetFallbackKind = FallbackKind | 'book' | 'decor';

/** Approximate world-space bounds in metres: [width, height, depth]. */
export const assetFallbackDimensions: Record<AssetFallbackKind, Vec3> = {
  piano: [1.5, 1, 2.25],
  chair: [0.5, 0.9, 0.55],
  desk: [1.4, 0.75, 0.7],
  lamp: [0.32, 0.55, 0.32],
  frame: [0.85, 1.05, 0.07],
  book: [0.18, 0.04, 0.25],
  books: [0.48, 0.15, 0.3],
  clock: [0.34, 0.32, 0.16],
  decor: [0.22, 0.38, 0.22],
  rug: [2.6, 0.015, 1.8]
};
