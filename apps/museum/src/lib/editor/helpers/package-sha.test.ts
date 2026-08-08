import { describe, expect, it } from 'vitest';
import { sha256Bytes } from './package-sha';

describe('package-sha', () => {
	it('produces the SHA-256 of an empty buffer as 64-char lowercase hex prefixed sha256-', async () => {
		const out = await sha256Bytes(new Uint8Array());
		// SHA-256 of empty: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
		expect(out).toBe(
			'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
	});

	it('produces a deterministic digest for identical bytes', async () => {
		const a = await sha256Bytes(new Uint8Array([1, 2, 3, 4, 5]));
		const b = await sha256Bytes(new Uint8Array([1, 2, 3, 4, 5]));
		expect(a).toBe(b);
	});

	it('produces different digests for different bytes', async () => {
		const a = await sha256Bytes(new Uint8Array([1, 2, 3, 4, 5]));
		const b = await sha256Bytes(new Uint8Array([5, 4, 3, 2, 1]));
		expect(a).not.toBe(b);
	});

	it('treats a subarray view + a copy identically', async () => {
		const buffer = new Uint8Array([9, 1, 2, 3, 4, 5, 9, 9, 9]);
		const view = buffer.subarray(1, 6);
		const copy = new Uint8Array(view);
		expect(await sha256Bytes(view)).toBe(await sha256Bytes(copy));
	});
});
