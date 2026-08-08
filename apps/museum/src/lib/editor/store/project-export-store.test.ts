/**
 * `project-export-store.test.ts` — Phase 5.4 blocker predicates.
 *
 * RED coverage for the spec's "Plain-JSON export gate":
 *  - empty / textures-empty documents → null blocker (unblocked)
 *  - one rewrite URI `/textures/<packageId>/...` registered in binary store →
 *    null (resolved locally)
 *  - one rewrite URI NOT registered → blocked with one entry
 *  - public catalogue URI `/museum/textures/...` (safe-uri fetchable) → null
 *  - one rewrite URI registered AND one public URI → null (mixed)
 *  - unsafe URI (https://...) → blocked (fetch fallback rejects)
 *  - idempotent: same args twice → same shape
 *  - mutate document → blocker reflects new shape
 *  - unresolvedCount helper matches `blocker.unresolvedTextures.length`
 */

import { describe, expect, it, vi } from 'vitest';
import {
	computeProjectExportBlocker,
	isPackageRewriteUri,
	isTextureUriResolved,
	unresolvedCount,
	unresolvedIds
} from './project-export-store.svelte';
import type { MuseumSceneDocument, SceneTextureAsset } from '$lib/content/scene';

const PRIVATE_PKG_ID = 'package-aabbccddeeff';

function makeTexture(overrides: Partial<SceneTextureAsset>): SceneTextureAsset {
	return {
		id: 'walnut',
		name: 'Walnut Detail',
		uri: '/textures/walnut.png',
		...overrides
	};
}

function makeDocument(textures: SceneTextureAsset[]): MuseumSceneDocument {
	return {
		version: 6,
		textures,
		materials: [],
		entities: [],
		navigationNodes: [],
		connections: [],
		layers: [],
		cameras: []
		// The cast bypasses the v6 codec but keeps the call sites ergonomic
		// — the predicate only reads `textures`.
	} as unknown as MuseumSceneDocument;
}

type StubBinaryStore = { has: (uri: string) => boolean };

function stubBinaryStore(uris: string[] = []): StubBinaryStore {
	const set = new Set(uris);
	return {
		has: vi.fn((uri: string) => set.has(uri))
	};
}

describe('project-export-store predicates', () => {
	describe('isPackageRewriteUri', () => {
		it('true on the canonical /textures/package-<12-hex>/<file> form', () => {
			expect(isPackageRewriteUri('/textures/package-aabbccddeeff/walnut.png')).toBe(true);
			expect(isPackageRewriteUri('/textures/package-aabbccddeeff/a/b/c.png')).toBe(true);
		});

		it('false on non-package URIs', () => {
			expect(isPackageRewriteUri('/textures/wood-walnut/map.png')).toBe(false);
			expect(isPackageRewriteUri('/museum/textures/walnut.png')).toBe(false);
		});

		it('false on uppercase hex (rewrite is always lowercase hex)', () => {
			expect(isPackageRewriteUri('/textures/package-AABBCCDDEEFF/walnut.png')).toBe(false);
		});

		it('false on wrong hex length (only 11 chars after the dash)', () => {
			expect(isPackageRewriteUri('/textures/package-aabbccddeef/walnut.png')).toBe(false);
			expect(isPackageRewriteUri('/textures/package-aabbccddeeffff/walnut.png')).toBe(false);
		});

		it('false on ? or # in the path', () => {
			expect(isPackageRewriteUri('/textures/package-aabbccddeeff/walnut.png?v=1')).toBe(false);
			expect(isPackageRewriteUri('/textures/package-aabbccddeeff/walnut.png#fragment')).toBe(false);
		});

		it('false on empty trailing path (no filename)', () => {
			// REWRITE_URI_PREFIX joins `${prefix}${destinationPath-without-textures/}`
			// — the destination always includes the sanitized filename so a bare
			// trailing slash should not match.
			expect(isPackageRewriteUri('/textures/package-aabbccddeeff/')).toBe(false);
		});

		it('false on non-package segments', () => {
			expect(isPackageRewriteUri('/textures/not-a-package/walnut.png')).toBe(false);
			expect(isPackageRewriteUri('/textures/walnut.png')).toBe(false);
		});

		it('true on /local/<12 hex>/<stem>.<ext> (Phase 5.4 session-local binary)', () => {
			expect(isPackageRewriteUri('/local/aabbccddeeff/walnut.png')).toBe(true);
			expect(isPackageRewriteUri('/local/aabbccddeeff/sub/dir.png')).toBe(true);
		});

		it('false on /local/ hex deviations', () => {
			// uppercase hex rejected — createLocalRandomId emits lowercase.
			expect(isPackageRewriteUri('/local/AABBCCDDEEFF/walnut.png')).toBe(false);
			// 11-char id rejected.
			expect(isPackageRewriteUri('/local/aabbccddeef/walnut.png')).toBe(false);
			// 13-char id rejected.
			expect(isPackageRewriteUri('/local/aabbccddeefff/walnut.png')).toBe(false);
		});

		it('false on /local/ with query/fragment/empty trail', () => {
			expect(isPackageRewriteUri('/local/aabbccddeeff/walnut.png?v=1')).toBe(false);
			expect(isPackageRewriteUri('/local/aabbccddeeff/walnut.png#frag')).toBe(false);
			expect(isPackageRewriteUri('/local/aabbccddeeff/')).toBe(false);
		});
	});

	describe('isTextureUriResolved', () => {
		it('true when binary store has the uri', () => {
			expect(isTextureUriResolved('/textures/pkg/walnut.png', stubBinaryStore(['/textures/pkg/walnut.png']).has)).toBe(
				true
			);
		});

		it('true when uri is safe-uri fetchable (fetch fallback path)', () => {
			expect(isTextureUriResolved('/museum/textures/walnut.png', stubBinaryStore().has)).toBe(true);
			expect(isTextureUriResolved('/textures/catalogue/walnut.png', stubBinaryStore().has)).toBe(true);
		});

		it('false when binary store does not have it AND uri is unsafe (https://...)', () => {
			expect(isTextureUriResolved('https://cdn.example.com/walnut.png', stubBinaryStore().has)).toBe(false);
		});

		it('false when binary store does not have it AND uri is unsafe (//evil/...)', () => {
			expect(isTextureUriResolved('//evil.example.com/walnut.png', stubBinaryStore().has)).toBe(false);
		});

		it('false when binary store does not have it AND uri is unsafe (?query=…)', () => {
			expect(isTextureUriResolved('/textures/walnut.png?a=b', stubBinaryStore().has)).toBe(false);
		});
	});

	describe('computeProjectExportBlocker', () => {
		it('empty document → null', () => {
			expect(computeProjectExportBlocker(makeDocument([]), stubBinaryStore())).toBeNull();
		});

		it('document whose textures are all resolved → null', () => {
			const textures = [
				makeTexture({ id: 'walnut', uri: '/textures/walnut.png' }),
				makeTexture({ id: 'plaster', uri: '/museum/textures/plaster.png' })
			];
			const store = stubBinaryStore(['/textures/walnut.png']);
			expect(computeProjectExportBlocker(makeDocument(textures), store)).toBeNull();
		});

		it('document with one rewrite URI registered in binary store → null', () => {
			const uri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const textures = [makeTexture({ id: 'walnut', uri })];
			const store = stubBinaryStore([uri]);
			expect(computeProjectExportBlocker(makeDocument(textures), store)).toBeNull();
		});

		it('document with one rewrite URI NOT registered → blocked with one entry', () => {
			const uri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const textures = [makeTexture({ id: 'walnut', uri })];
			const result = computeProjectExportBlocker(makeDocument(textures), stubBinaryStore());
			expect(result).not.toBeNull();
			expect(result!.unresolvedTextures.length).toBe(1);
			expect(result!.unresolvedTextures[0]!.id).toBe('walnut');
			expect(result!.unresolvedTextures[0]!.uri).toBe(uri);
		});

		it('mixed local + public → unblocked', () => {
			const localUri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const textures = [
				makeTexture({ id: 'walnut', uri: localUri }),
				makeTexture({ id: 'plaster', uri: '/museum/textures/plaster.png' })
			];
			const store = stubBinaryStore([localUri]);
			expect(computeProjectExportBlocker(makeDocument(textures), store)).toBeNull();
		});

		it('mixed registered + unregistered → blocked with only the unregistered entry', () => {
			const regUri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const unregUri = `/textures/${PRIVATE_PKG_ID}/plaster.png`;
			const textures = [
				makeTexture({ id: 'walnut', uri: regUri }),
				makeTexture({ id: 'plaster', uri: unregUri })
			];
			const store = stubBinaryStore([regUri]);
			const result = computeProjectExportBlocker(makeDocument(textures), store);
			expect(result).not.toBeNull();
			expect(result!.unresolvedTextures.length).toBe(1);
			expect(result!.unresolvedTextures[0]!.id).toBe('plaster');
		});

		it('unsafe URI → blocked regardless of binary store', () => {
			const textures = [makeTexture({ id: 'evil', uri: 'https://cdn.example.com/x.png' })];
			const result = computeProjectExportBlocker(makeDocument(textures), stubBinaryStore());
			expect(result).not.toBeNull();
			expect(result!.unresolvedTextures[0]!.id).toBe('evil');
		});

		it('idempotent: same args twice → same shape', () => {
			const uri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const textures = [makeTexture({ id: 'walnut', uri })];
			const store = stubBinaryStore();
			const first = computeProjectExportBlocker(makeDocument(textures), store);
			const second = computeProjectExportBlocker(makeDocument(textures), store);
			expect(first).toEqual(second);
		});

		it('document update changes the blocker', () => {
			const localUri = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const docA = makeDocument([makeTexture({ id: 'walnut', uri: localUri })]);
			const store = stubBinaryStore();
			const before = computeProjectExportBlocker(docA, store);
			expect(before).not.toBeNull();
			expect(before!.unresolvedTextures.length).toBe(1);

			// Update: register the local uri, rewrite the texture. Now resolved.
			const storeAfter = stubBinaryStore([localUri]);
			const docB = makeDocument([makeTexture({ id: 'walnut', uri: localUri })]);
			const after = computeProjectExportBlocker(docB, storeAfter);
			expect(after).toBeNull();
		});

		it('document update: importing without resolving → still blocked', () => {
			const localUriA = `/textures/${PRIVATE_PKG_ID}/walnut.png`;
			const localUriB = `/textures/${PRIVATE_PKG_ID}/plaster.png`;
			const docA = makeDocument([makeTexture({ id: 'walnut', uri: localUriA })]);
			const docB = makeDocument([
				makeTexture({ id: 'walnut', uri: localUriA }),
				makeTexture({ id: 'plaster', uri: localUriB })
			]);
			const store = stubBinaryStore();
			const before = computeProjectExportBlocker(docA, store);
			const after = computeProjectExportBlocker(docB, store);
			expect(before!.unresolvedTextures.length).toBe(1);
			expect(after!.unresolvedTextures.length).toBe(2);
		});
	});

	describe('unresolvedCount', () => {
		it('zero when unblocked', () => {
			expect(unresolvedCount(makeDocument([]), stubBinaryStore())).toBe(0);
		});

		it('matches blocker.unresolvedTextures.length when blocked', () => {
			const doc = makeDocument([
				makeTexture({ uri: `/textures/${PRIVATE_PKG_ID}/walnut.png` }),
				makeTexture({ uri: `/textures/${PRIVATE_PKG_ID}/plaster.png` })
			]);
			expect(unresolvedCount(doc, stubBinaryStore())).toBe(2);
		});
	});

	describe('unresolvedIds', () => {
		it('empty array when unblocked', () => {
			expect(unresolvedIds(makeDocument([]), stubBinaryStore())).toEqual([]);
		});

		it('ordered list of asset ids when blocked', () => {
			const doc = makeDocument([
				makeTexture({ id: 'walnut', uri: `/textures/${PRIVATE_PKG_ID}/walnut.png` }),
				makeTexture({ id: 'plaster', uri: `/textures/${PRIVATE_PKG_ID}/plaster.png` })
			]);
			expect(unresolvedIds(doc, stubBinaryStore())).toEqual(['walnut', 'plaster']);
		});
	});
});
