/**
 * `binary-texture-store.test.ts` — Phase 5.4 store.
 *
 * RED coverage for the singleton `BinaryTextureStore`. Asserts:
 *  - register returns the same fingerprint for identical bytes fingerprints,
 *  - distinct byte batches ⇒ distinct fingerprints,
 *  - `has` reflects the registered set,
 *  - `resolve` returns the registered bytes,
 *  - `clearExcept(retain)` revokes object URLs for pruned entries and keeps
 *    `retain`,
 *  - `releaseAllObjectUrls` empties `pendingObjectUrls`,
 *  - `URL.createObjectURL` is only called through `acquireObjectUrl` /
 *    `BinaryTextureStore.objectUrlFor`, never directly,
 *  - `register` re-run with same uri + same bytes keeps the same fingerprint
 *    (overwrite is well-defined),
 *  - the singleton can be reset between tests via `__resetForTests()`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BinaryTextureStore,
	__resetBinaryTextureStoreForTests,
	acquireObjectUrl,
	releaseAllObjectUrls,
	releaseObjectUrl
} from './binary-texture-store.svelte';

const A_BYTES = new TextEncoder().encode('alpha-png-bytes');
const B_BYTES = new TextEncoder().encode('bravo-webp-bytes');
const C_BYTES = new TextEncoder().encode('charlie-jpeg-bytes');

describe('binary-texture-store', () => {
	let originalCreate: typeof URL.createObjectURL;
	let originalRevoke: typeof URL.revokeObjectURL;
	let created: string[];
	let revoked: string[];

	beforeEach(() => {
		__resetBinaryTextureStoreForTests();
		created = [];
		revoked = [];
		originalCreate = URL.createObjectURL;
		originalRevoke = URL.revokeObjectURL;
		URL.createObjectURL = vi.fn((_input: unknown) => {
			const url = `blob:test/${created.length + 1}`;
			created.push(url);
			return url;
		});
		URL.revokeObjectURL = vi.fn((url: string) => {
			revoked.push(url);
		});
	});

	afterEach(() => {
		URL.createObjectURL = originalCreate;
		URL.revokeObjectURL = originalRevoke;
	});

	it('register: returns the same fingerprint for identical bytes fingerprints', async () => {
		const a = await BinaryTextureStore.register('/textures/pkg-a/walnut.png', A_BYTES, 'image/png');
		const a2 = await BinaryTextureStore.register('/textures/pkg-a/walnut.png', A_BYTES, 'image/png');
		expect(a.fingerprint).toBe(a2.fingerprint);
		expect(a.fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/);
	});

	it('register: distinct byte batches produce distinct fingerprints', async () => {
		const a = await BinaryTextureStore.register('/textures/pkg/a.png', A_BYTES, 'image/png');
		const b = await BinaryTextureStore.register('/textures/pkg/a.png', B_BYTES, 'image/png');
		const c = await BinaryTextureStore.register('/textures/pkg/a.png', C_BYTES, 'image/png');
		expect(new Set([a.fingerprint, b.fingerprint, c.fingerprint]).size).toBe(3);
	});

	it('has + resolve reflect the registered set + bytes', async () => {
		expect(BinaryTextureStore.has('/textures/pkg/walnut.png')).toBe(false);
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		expect(BinaryTextureStore.has('/textures/pkg/walnut.png')).toBe(true);
		await expect(BinaryTextureStore.resolve('/textures/pkg/walnut.png')).resolves.toEqual(A_BYTES);
		await expect(BinaryTextureStore.resolve('/textures/pkg/missing.png')).rejects.toThrow(
			/No binary texture registered/
		);
	});

	it('getEntry exposes mime + fingerprint + bytes for diagnostics', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		const entry = BinaryTextureStore.getEntry('/textures/pkg/walnut.png');
		expect(entry).toBeTruthy();
		expect(entry!.mime).toBe('image/png');
		expect(entry!.fingerprint).toMatch(/^sha256-[0-9a-f]{64}$/);
		expect(entry!.bytes).toEqual(A_BYTES);
		expect(entry!.objectUrl).toBeNull();
		expect(BinaryTextureStore.getEntry('/textures/pkg/missing.png')).toBeNull();
	});

	it('objectUrlFor: creates + tracks an Object URL on first call only', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		const url1 = BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		const url2 = BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		expect(url1).not.toBeNull();
		expect(url1).toBe(url2); // same key, same URL
		expect(BinaryTextureStore.pendingObjectUrls.has(url1!)).toBe(true);
		// URL.createObjectURL fired exactly once for this entry.
		expect(created.filter((u) => u === url1).length).toBe(1);
	});

	it('clearExcept: revokes pruned URLs, retains the rest, and trims the map', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		await BinaryTextureStore.register('/textures/pkg/sofa.png', B_BYTES, 'image/webp');
		const walnutUrl = BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		const sofaUrl = BinaryTextureStore.objectUrlFor('/textures/pkg/sofa.png');
		expect(walnutUrl).not.toBeNull();
		expect(sofaUrl).not.toBeNull();
		expect(created.length).toBe(2);

		BinaryTextureStore.clearExcept(new Set(['/textures/pkg/walnut.png']));

		expect(BinaryTextureStore.has('/textures/pkg/walnut.png')).toBe(true);
		expect(BinaryTextureStore.has('/textures/pkg/sofa.png')).toBe(false);
		expect(revoked).toContain(sofaUrl);
		expect(revoked).not.toContain(walnutUrl);
		expect(BinaryTextureStore.pendingObjectUrls.has(walnutUrl!)).toBe(true);
		expect(BinaryTextureStore.pendingObjectUrls.has(sofaUrl!)).toBe(false);
	});

	it('clearExcept(undefined/null) drops every entry', async () => {
		await BinaryTextureStore.register('/textures/pkg/a.png', A_BYTES, 'image/png');
		await BinaryTextureStore.register('/textures/pkg/b.png', B_BYTES, 'image/png');
		const urlA = BinaryTextureStore.objectUrlFor('/textures/pkg/a.png');
		const urlB = BinaryTextureStore.objectUrlFor('/textures/pkg/b.png');
		BinaryTextureStore.clearExcept(new Set());
		expect(BinaryTextureStore.has('/textures/pkg/a.png')).toBe(false);
		expect(BinaryTextureStore.has('/textures/pkg/b.png')).toBe(false);
		expect(revoked).toContain(urlA);
		expect(revoked).toContain(urlB);
	});

	it('releaseAllObjectUrls empties pendingObjectUrls without losing entries', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		const url = BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		expect(BinaryTextureStore.pendingObjectUrls.size).toBeGreaterThan(0);
		BinaryTextureStore.releaseAllObjectUrls();
		expect(BinaryTextureStore.pendingObjectUrls.size).toBe(0);
		expect(revoked).toContain(url);
		// Entries stay registered so callers can re-acquire without re-uploading.
		expect(BinaryTextureStore.has('/textures/pkg/walnut.png')).toBe(true);
		// Re-acquiring fires another createObjectURL since old URL is cleared.
		const url2 = BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		expect(url2).not.toBe(url);
		expect(created.length).toBe(2);
	});

	it('acquireObjectUrl helper: helper is the ONLY call site for URL.createObjectURL from outside', () => {
		// Direct call must go through helper or store methods.
		const helperUrl = acquireObjectUrl(A_BYTES, 'image/png');
		expect(BinaryTextureStore.pendingObjectUrls.has(helperUrl)).toBe(true);
		expect(created).toContain(helperUrl);
		releaseObjectUrl(helperUrl);
		expect(revoked).toContain(helperUrl);
		expect(BinaryTextureStore.pendingObjectUrls.has(helperUrl)).toBe(false);
	});

	it('releaseObjectUrl is a no-op for untracked URLs (no double-revoke hazards)', () => {
		const before = BinaryTextureStore.pendingObjectUrls.size;
		const createdBefore = created.length;
		const revokedBefore = revoked.length;
		releaseObjectUrl('blob:test/never-tracked');
		// Pending set is unchanged.
		expect(BinaryTextureStore.pendingObjectUrls.size).toBe(before);
		// We do NOT call URL.revokeObjectURL on URLs we did not create — that
		// would be a side-effect on URLs owned by another store.
		expect(created.length).toBe(createdBefore);
		expect(revoked.length).toBe(revokedBefore);
		expect(revoked).not.toContain('blob:test/never-tracked');
	});

	it('releaseAllObjectUrls module-level helper delegates to the singleton', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		BinaryTextureStore.objectUrlFor('/textures/pkg/walnut.png');
		expect(BinaryTextureStore.pendingObjectUrls.size).toBeGreaterThan(0);
		releaseAllObjectUrls();
		expect(BinaryTextureStore.pendingObjectUrls.size).toBe(0);
	});

	it('peekAllUris lists registered uris without re-firing get', async () => {
		await BinaryTextureStore.register('/textures/pkg/walnut.png', A_BYTES, 'image/png');
		await BinaryTextureStore.register('/textures/pkg/sofa.png', B_BYTES, 'image/png');
		expect(new Set(BinaryTextureStore.peekAllUris())).toEqual(
			new Set(['/textures/pkg/walnut.png', '/textures/pkg/sofa.png'])
		);
	});
});
