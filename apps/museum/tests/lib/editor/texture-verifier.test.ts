import { describe, expect, it, vi } from 'vitest';
import { createTextureVerifier } from '$lib/editor/texture-verifier';
import type { Texture as ThreeTexture } from 'three';
import type { MaterialTextureSlot } from '$lib/types/materials';

const SAFE = '/textures/wall.webp';

function stubTexture(uri: string): ThreeTexture {
	return {
		source: { data: null },
		uuid: uri,
		image: { complete: true }
	} as unknown as ThreeTexture;
}

describe('texture verifier', () => {
	it('rejects unsafe URIs without invoking the loader', async () => {
		const load = vi.fn(
			async (_uri: string, _slot: MaterialTextureSlot) => stubTexture('x')
		);
		const verify = createTextureVerifier(load);

		const result = await verify('https://example.com/x.png');

		expect(result.status).toBe('unsafe-uri');
		expect(load).not.toHaveBeenCalled();
	});

	it('returns ready when the source loader resolves', async () => {
		const load = vi.fn(
			async (uri: string, _slot: MaterialTextureSlot) => stubTexture(uri)
		);
		const verify = createTextureVerifier(load);

		expect(await verify(SAFE)).toEqual({ status: 'ready' });
		expect(load).toHaveBeenCalledWith(SAFE, 'map');
	});

	it('returns load-failed when the source loader rejects', async () => {
		const load = vi.fn(async (_uri: string, _slot: MaterialTextureSlot) =>
			Promise.reject(new Error('boom'))
		);
		const verify = createTextureVerifier(load);

		const result = await verify(SAFE);

		expect(result.status).toBe('load-failed');
		if (result.status === 'load-failed') {
			expect(result.message).toContain('boom');
		}
	});

	it('coalesces concurrent calls to the same URI', async () => {
		let resolveFirst: (() => void) | undefined;
		const load = vi.fn(
			(_uri: string, _slot: MaterialTextureSlot) =>
				new Promise<ThreeTexture>((resolve) => {
					resolveFirst = () => resolve(stubTexture('/textures/a.png'));
				})
		);
		const verify = createTextureVerifier(load);

		const first = verify('/textures/a.png');
		const second = verify('/textures/a.png');

		expect(load).toHaveBeenCalledTimes(1);
		resolveFirst?.();
		const [a, b] = await Promise.all([first, second]);
		expect(a).toEqual({ status: 'ready' });
		expect(b).toEqual({ status: 'ready' });
	});

	it('does not coalesce distinct URIs', async () => {
		const load = vi.fn(
			async (uri: string, _slot: MaterialTextureSlot) => stubTexture(uri)
		);
		const verify = createTextureVerifier(load);
		await Promise.all([verify('/textures/a.png'), verify('/textures/b.png')]);
		expect(load.mock.calls.map((call) => call[0])).toEqual([
			'/textures/a.png',
			'/textures/b.png'
		]);
	});

	it('retries a failed URI on the next call', async () => {
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error('first'))
			.mockResolvedValueOnce(stubTexture(SAFE));
		const verify = createTextureVerifier(load);

		const failed = await verify(SAFE);
		expect(failed.status).toBe('load-failed');

		const retry = await verify(SAFE);
		expect(retry).toEqual({ status: 'ready' });
		expect(load).toHaveBeenCalledTimes(2);
	});
});
