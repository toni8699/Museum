import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	acquireEffectiveVariant,
	loadEffectiveTextures,
	releaseEffectiveVariant,
	resetTextureCachesForTests
} from './texture-cache';
import type { EffectiveSceneMaterial } from './scene-instance-material';
import type { Texture as ThreeTexture, Vector2 } from 'three';

const texturesByUri = new Map<string, ThreeTexture>();

vi.mock('three', async () => {
	const actual = await vi.importActual<typeof import('three')>('three');
	class MockTextureLoader {
		load(
			url: string,
			onLoad: (tex: ThreeTexture) => void,
			_onProgress: unknown,
			onError: (event: { message?: string }) => void
		): unknown {
			const existing = texturesByUri.get(url);
			if (existing) {
				queueMicrotask(() => onLoad(existing));
				return;
			}
			const tex: ThreeTexture = {
				source: { data: null },
				isTexture: true,
				uuid: url,
				// Three reads image.complete; coerce a plain object that satisfies the boolean field.
				image: { complete: true, naturalWidth: 32, naturalHeight: 32 },
				needsUpdate: false,
				colorSpace: '',
				wrapS: 0,
				wrapT: 0,
				repeat: {
					set(_x: number, _y: number) {
						/* mock */
					},
					x: 1,
					y: 1
				} as Vector2,
				rotation: 0,
				center: { set() {} },
				clone(this: ThreeTexture) {
					return { ...this } as ThreeTexture;
				},
				dispose() {
					/* mock */
				}
			} as unknown as ThreeTexture;
			texturesByUri.set(url, tex);
			queueMicrotask(() => onLoad(tex));
			return;
		}
	}
	return { ...actual, TextureLoader: MockTextureLoader };
});

const effectiveA: EffectiveSceneMaterial = {
	catalogue: 'plaster-warm',
	slotUris: { map: '/textures/a.png' },
	roughness: 0.92,
	metalness: 0.02,
	color: '#c4b4a0',
	defaultTileSizeMeters: [2, 2],
	variantSeed: 'vAABBCC'
};

const effectiveB: EffectiveSceneMaterial = {
	catalogue: 'plaster-warm',
	slotUris: { map: '/textures/b.webp' },
	roughness: 0.92,
	metalness: 0.02,
	color: '#c4b4a0',
	defaultTileSizeMeters: [2, 2],
	variantSeed: 'vDDEEFF'
};

describe('texture-cache extensions', () => {
	beforeEach(() => {
		texturesByUri.clear();
		resetTextureCachesForTests();
	});

	afterEach(() => {
		texturesByUri.clear();
		resetTextureCachesForTests();
	});

	it('loadEffectiveTextures returns ready when every URI resolves', async () => {
		const result = await loadEffectiveTextures(effectiveA);
		expect(result.status).toBe('ready');
		if (result.status === 'ready') {
			expect(result.maps.map?.uuid).toBe('/textures/a.png');
		}
	});

	it('acquireEffectiveVariant returns the same maps reference for repeat acquires', () => {
		const first = acquireEffectiveVariant(effectiveA, 2, 2, 0);
		const second = acquireEffectiveVariant(effectiveA, 2, 2, 0);
		expect(second).toBe(first);

		// Different effective → different variant
		const third = acquireEffectiveVariant(effectiveB, 2, 2, 0);
		expect(third).not.toBe(first);
	});

	it('release is idempotent and does not throw on extra calls', () => {
		acquireEffectiveVariant(effectiveA, 1, 1, 0);
		releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
		releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
		releaseEffectiveVariant(effectiveA.variantSeed, 1, 1, 0);
	});

	it('uses the slot key correctly when loading', async () => {
		// Concurrent loads for the same effective share the underlying THREE.Texture.
		const [a, b] = await Promise.all([
			loadEffectiveTextures(effectiveA),
			loadEffectiveTextures(effectiveA)
		]);
		expect(a.status).toBe('ready');
		expect(b.status).toBe('ready');
		expect(texturesByUri.size).toBe(1);
	});
});
