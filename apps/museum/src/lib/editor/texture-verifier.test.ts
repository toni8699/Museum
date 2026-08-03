import { describe, expect, it, vi } from 'vitest';
import { createTextureVerifier } from './texture-verifier';

const SAFE = '/textures/wall.webp';

describe('texture verifier', () => {
	it('rejects unsafe URIs without invoking the loader', async () => {
		const load = vi.fn().mockResolvedValue(undefined);
		const verify = createTextureVerifier(load);

		const result = await verify('https://example.com/x.png');

		expect(result.success).toBe(false);
		if (result.success === false) expect(result.code).toBe('unsafe-uri');
		expect(load).not.toHaveBeenCalled();
	});

	it('returns success when the loader resolves', async () => {
		const load = vi.fn().mockResolvedValue(undefined);
		const verify = createTextureVerifier(load);

		expect(await verify(SAFE)).toEqual({ success: true });
		expect(load).toHaveBeenCalledWith(SAFE);
	});

	it('returns load-failed when the loader rejects', async () => {
		const load = vi.fn().mockRejectedValue(new Error('boom'));
		const verify = createTextureVerifier(load);

		const result = await verify(SAFE);

		expect(result.success).toBe(false);
		if (result.success === false) {
			expect(result.code).toBe('load-failed');
			expect(result.message).toContain(SAFE);
		}
	});

	it('shares a single loader invocation per URI across concurrent checks', async () => {
		const resolvers = new Map<string, () => void>();
		const load = vi.fn().mockImplementation(
			(uri: string) =>
				new Promise<void>((resolve) => {
					resolvers.set(uri, resolve);
				})
		);
		const verify = createTextureVerifier(load);

		const first = verify('/textures/a.png');
		const second = verify('/textures/a.png');
		const third = verify('/textures/b.png');

		expect(load).toHaveBeenCalledTimes(2);
		resolvers.get('/textures/a.png')?.();
		resolvers.get('/textures/b.png')?.();
		const [a1, a2, b] = await Promise.all([first, second, third]);
		expect(a1).toEqual({ success: true });
		expect(a2).toEqual({ success: true });
		expect(b).toEqual({ success: true });
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('drops the pending entry after settlement so retries can run again', async () => {
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error('first'))
			.mockResolvedValueOnce(undefined);
		const verify = createTextureVerifier(load);

		const failed = await verify(SAFE);
		expect(failed.success).toBe(false);

		const retry = await verify(SAFE);
		expect(retry).toEqual({ success: true });
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('does not coalesce distinct URIs', async () => {
		const load = vi.fn().mockResolvedValue(undefined);
		const verify = createTextureVerifier(load);

		await Promise.all([verify('/textures/a.png'), verify('/textures/b.png')]);
		expect(load).toHaveBeenCalledTimes(2);
	});
});
