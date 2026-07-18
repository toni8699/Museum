import { describe, expect, it } from 'vitest';
import {
  getAssetById,
  listMuseumAssets,
  museumAssets,
  validateMuseumAssetManifest
} from './assets';

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
});
