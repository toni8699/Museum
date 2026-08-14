import { describe, expect, it } from 'vitest';
import {
  getAssetById,
  listMuseumAssets,
  museumAssets,
  resolveAssetFallback,
  validateMuseumAssetManifest
} from '$lib/content/assets';
import type { MuseumAsset } from '$lib/types/assets';

describe('museum asset manifest', () => {
  it('validates the checked-in manifest', () => {
    expect(() => validateMuseumAssetManifest(museumAssets)).not.toThrow();
  });

  it('looks up unknown IDs without silently substituting an asset', () => {
    expect(getAssetById('missing-asset')).toBeUndefined();
  });

  it('searches id, name, and category case-insensitively', () => {
    expect(listMuseumAssets({ query: 'GRAND PIANO' })).toHaveLength(1);
    expect(listMuseumAssets({ query: 'DECOR' }).every((asset) => asset.category === 'decor')).toBe(true);
    expect(listMuseumAssets({ query: '' })).toHaveLength(museumAssets.length);
  });

  it('requires approved files and fallback metadata for fileless assets', () => {
    const approvedWithoutFile = { ...museumAssets[0], productionFile: undefined };
    expect(() => validateMuseumAssetManifest([approvedWithoutFile])).toThrow(/production file/);

    const placeholderWithoutFallback = {
      ...museumAssets[0],
      id: 'fileless-placeholder',
      productionFile: undefined,
      status: 'placeholder' as const,
      fallback: undefined
    };
    expect(() => validateMuseumAssetManifest([placeholderWithoutFallback])).toThrow(/fallback/);
  });

  it('allows duplicate production paths', () => {
    const duplicate = { ...museumAssets[0], id: 'duplicate-path' };
    expect(() => validateMuseumAssetManifest([museumAssets[0], duplicate])).not.toThrow();
  });

  it('validates placement surfaces and finite radian default rotations', () => {
    expect(museumAssets.every((asset) => asset.placementSurface)).toBe(true);

    const invalidSurface = {
      ...museumAssets[0],
      placementSurface: 'tabletop'
    } as unknown as MuseumAsset;
    expect(() => validateMuseumAssetManifest([invalidSurface])).toThrow(/placement surface/);

    const invalidRotation = {
      ...museumAssets[0],
      defaultRotation: [0, Number.NaN, 0]
    } as MuseumAsset;
    expect(() => validateMuseumAssetManifest([invalidRotation])).toThrow(/default rotation/);
  });

  it('normalizes fallbacks without mutating manifest assets', () => {
    const explicit = { ...museumAssets[0], fallback: 'chair' as const };
    const before = JSON.stringify(explicit);
    expect(resolveAssetFallback(explicit)).toBe('chair');
    expect(JSON.stringify(explicit)).toBe(before);

    expect(resolveAssetFallback({ ...museumAssets[0], category: 'book', fallback: undefined })).toBe('books');
    expect(resolveAssetFallback({ ...museumAssets[0], category: 'decor', fallback: undefined })).toBe('rug');

    const invalid = { ...museumAssets[0], fallback: 'invalid' } as unknown as MuseumAsset;
    expect(() => resolveAssetFallback(invalid)).toThrow(/Invalid fallback/);
  });
});
