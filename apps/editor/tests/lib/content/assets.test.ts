import { describe, expect, it } from 'vitest';
import {
  getAssetById,
  listAssets,
  assets,
  validateAssetFootprint,
  resolveAssetFallback,
  validateAssetManifest
} from '$lib/content/assets';
import type { Asset } from '$lib/types/assets';

describe('asset manifest', () => {
  it('validates the checked-in manifest', () => {
    expect(() => validateAssetManifest(assets)).not.toThrow();
  });

  it('looks up unknown IDs without silently substituting an asset', () => {
    expect(getAssetById('missing-asset')).toBeUndefined();
  });

  it('searches id, name, and category case-insensitively', () => {
    expect(listAssets({ query: 'GRAND PIANO' })).toHaveLength(1);
    expect(listAssets({ query: 'DECOR' }).every((asset) => asset.category === 'decor')).toBe(true);
    expect(listAssets({ query: '' })).toHaveLength(assets.length);
  });

  it('requires approved files and fallback metadata for fileless assets', () => {
    const approvedWithoutFile = { ...assets[0], productionFile: undefined };
    expect(() => validateAssetManifest([approvedWithoutFile])).toThrow(/production file/);

    const placeholderWithoutFallback = {
      ...assets[0],
      id: 'fileless-placeholder',
      productionFile: undefined,
      status: 'placeholder' as const,
      fallback: undefined
    };
    expect(() => validateAssetManifest([placeholderWithoutFallback])).toThrow(/fallback/);
  });

  it('allows duplicate production paths', () => {
    const duplicate = { ...assets[0], id: 'duplicate-path' };
    expect(() => validateAssetManifest([assets[0], duplicate])).not.toThrow();
  });

  it('validates placement surfaces and finite radian default rotations', () => {
    expect(assets.every((asset) => asset.placementSurface)).toBe(true);

    const invalidSurface = {
      ...assets[0],
      placementSurface: 'tabletop'
    } as unknown as Asset;
    expect(() => validateAssetManifest([invalidSurface])).toThrow(/placement surface/);

    const invalidRotation = {
      ...assets[0],
      defaultRotation: [0, Number.NaN, 0]
    } as Asset;
    expect(() => validateAssetManifest([invalidRotation])).toThrow(/default rotation/);
  });

  it('validates optional canonical footprints without repairing invalid outlines', () => {
    expect(validateAssetFootprint({ width: 2, depth: 3 })).toBeNull();
    expect(validateAssetFootprint({ width: 2, depth: 3, outline: [[0, 0], [2, 0], [1, 1], [2, 2], [0, 2]] })).toBeNull();
    expect(validateAssetFootprint({ width: 2, depth: 3, outline: [[0, 0], [3, 3], [0, 2], [2, 0]] })).toMatch(/simple polygon/);
    expect(validateAssetFootprint({ width: 2, depth: 3, outline: [[0, 0], [1, 0], [0, 0]] })).toMatch(/closing point/);
    expect(() => validateAssetManifest([{ ...assets[0], footprint: { width: 0, depth: 1 } }])).toThrow(/footprint/);
  });

  it('normalizes fallbacks without mutating manifest assets', () => {
    const explicit = { ...assets[0], fallback: 'chair' as const };
    const before = JSON.stringify(explicit);
    expect(resolveAssetFallback(explicit)).toBe('chair');
    expect(JSON.stringify(explicit)).toBe(before);

    expect(resolveAssetFallback({ ...assets[0], category: 'book', fallback: undefined })).toBe('books');
    expect(resolveAssetFallback({ ...assets[0], category: 'decor', fallback: undefined })).toBe('rug');

    const invalid = { ...assets[0], fallback: 'invalid' } as unknown as Asset;
    expect(() => resolveAssetFallback(invalid)).toThrow(/Invalid fallback/);
  });
});
