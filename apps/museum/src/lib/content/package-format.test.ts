import { describe, expect, it } from 'vitest';
import {
	REWRITE_URI_PREFIX,
	assertManifestVersion,
	buildPackageManifest,
	collisionSuffix,
	derivePackageId,
	extensionForMime,
	isSupportedMime,
	packageFilenameFor,
	sanitizeFilename,
	type PackageManifest,
	type PackageManifestTextureEntry
} from './package-format';

describe('package-format', () => {
	describe('assertManifestVersion', () => {
		it('accepts formatVersion 1 and schemaVersion 6', () => {
			expect(() =>
				assertManifestVersion({ formatVersion: 1, schemaVersion: 6 })
			).not.toThrow();
		});

		it('rejects unsupported formatVersion', () => {
			expect(() =>
				assertManifestVersion({ formatVersion: 2, schemaVersion: 6 })
			).toThrow(/formatVersion/);
		});

		it('rejects unsupported schemaVersion', () => {
			expect(() =>
				assertManifestVersion({ formatVersion: 1, schemaVersion: 5 })
			).toThrow(/schemaVersion/);
		});

		it('rejects formatVersion 0', () => {
			expect(() =>
				assertManifestVersion({ formatVersion: 0, schemaVersion: 6 })
			).toThrow(/formatVersion/);
		});
	});

	describe('derivePackageId', () => {
		it('produces a sortable, deterministic id for the same set of fingerprints', async () => {
			const a = await derivePackageId(['fpB', 'fpA']);
			const b = await derivePackageId(['fpA', 'fpB']);
			expect(a).toBe(b);
			expect(a).toMatch(/^package-[0-9a-f]{12}$/);
		});

		it('produces different ids for different fingerprint sets', async () => {
			const a = await derivePackageId(['fpA', 'fpB']);
			const b = await derivePackageId(['fpA', 'fpC']);
			expect(a).not.toBe(b);
		});

		it('produces different ids when an entry is empty', async () => {
			const a = await derivePackageId([]);
			const b = await derivePackageId(['fpA']);
			expect(a).not.toBe(b);
		});
	});

	describe('sanitizeFilename', () => {
		it('lowercases, normalizes, strips junk, and selects extension by MIME', () => {
			expect(sanitizeFilename('Walnut Wall (Detail).PNG', 'image/png')).toBe(
				'walnut_wall_detail.png'
			);
		});

		it('converts non-ascii and whitespace runs to underscores and collapses them', () => {
			// `café   mural.jpg` after lowercase + char replace + collapse → `caf_mural`
			// + force extension to `.jpg` → `caf_mural.jpg`.
			expect(sanitizeFilename('café   mural.jpg', 'image/jpeg')).toBe('caf_mural.jpg');
		});

		it('strips a trailing "_<digits>" copy-number so the canonical -N suffix takes over', () => {
			// `Wall Detail 2.png` → strip ext → `Wall Detail 2` → lower → replace →
			// `wall_detail_2` → strip trailing `_<digits>` → `wall_detail` → append `.png`.
			expect(sanitizeFilename('Wall Detail 2.png', 'image/png')).toBe('wall_detail.png');
		});

		it('keeps bare digits that are not trailing copy-numbers', () => {
			// `texture2024.png` has no leading underscore on the trailing digits, so
			// the decoration-strip does not fire and the name is preserved as-is.
			expect(sanitizeFilename('texture2024.png', 'image/png')).toBe('texture2024.png');
		});

		it('prepends underscore when sanitized slug still starts with non-alnum', () => {
			// `@walnut.png` → strip ext → `@walnut` → `@` → `_` → `_walnut` → starts
			// with `_` → prepend `_` → `__walnut`. Append `.png` → `__walnut.png`.
			expect(sanitizeFilename('@walnut.png', 'image/png')).toBe('__walnut.png');
		});

		it('forces extension from MIME when filename has wrong extension', () => {
			expect(sanitizeFilename('photo.png', 'image/webp')).toBe('photo.webp');
		});

		it('truncates very long filenames to <= 128 chars', () => {
			const long = 'a'.repeat(200);
			const out = sanitizeFilename(`${long}.webp`, 'image/webp');
			expect(out.length).toBeLessThanOrEqual(128);
			expect(out.endsWith('.webp')).toBe(true);
		});

		it('rejects unsupported MIME', () => {
			expect(() => sanitizeFilename('doc.txt', 'text/plain')).toThrow(/Unsupported MIME/);
		});
	});

	describe('collisionSuffix', () => {
		it('returns the candidate unchanged when it is unique', () => {
			expect(collisionSuffix(['a.png'], 'b.png')).toBe('b.png');
		});

		it('appends -2 to a single collision', () => {
			expect(collisionSuffix(['detail.png'], 'detail.png')).toBe('detail-2.png');
		});

		it('walks to the next available numeric suffix', () => {
			expect(
				collisionSuffix(['detail.png', 'detail-2.png', 'detail-4.png'], 'detail.png')
			).toBe('detail-3.png');
		});

		it('keeps the new candidate stable across repeated calls', () => {
			const used = ['detail.png'];
			expect(collisionSuffix(used, 'detail.png')).toBe('detail-2.png');
			used.push('detail-2.png');
			expect(collisionSuffix(used, 'detail.png')).toBe('detail-3.png');
		});
	});

	describe('extensionForMime / isSupportedMime', () => {
		it('returns .png for image/png', () => {
			expect(extensionForMime('image/png')).toBe('.png');
		});
		it('returns .webp for image/webp', () => {
			expect(extensionForMime('image/webp')).toBe('.webp');
		});
		it('returns .jpg for image/jpeg', () => {
			expect(extensionForMime('image/jpeg')).toBe('.jpg');
		});
		it('rejects unsupported MIME', () => {
			expect(() => extensionForMime('image/avif')).toThrow();
		});
		it('isSupportedMime type-guard matches supported MIME list', () => {
			expect(isSupportedMime('image/png')).toBe(true);
			expect(isSupportedMime('image/webp')).toBe(true);
			expect(isSupportedMime('image/jpeg')).toBe(true);
			expect(isSupportedMime('image/gif')).toBe(false);
		});
	});

	describe('buildPackageManifest', () => {
		it('round-trips through JSON.stringify + JSON.parse', () => {
			const entries: PackageManifestTextureEntry[] = [
				{
					assetId: 'walnut',
					originalName: 'walnut.png',
					mime: 'image/png',
					size: 42,
					fingerprint: 'sha256-abc',
					destinationPath: 'textures/walnut.png'
				}
			];
			const manifest: PackageManifest = {
				package: {
					id: 'package-aabbccddeeff',
					formatVersion: 1,
					schemaVersion: 6,
					createdAt: '2026-08-07T18:30:00.000Z',
					generator: 'museum-editor-5.4',
					documentTitle: 'museum-scene'
				},
				textures: entries
			};
			expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
		});
	});

	describe('REWRITE_URI_PREFIX', () => {
		it('produces the rewritten URI prefix for the given package id', () => {
			expect(REWRITE_URI_PREFIX('package-abc123456789')).toBe('/textures/package-abc123456789/');
		});
	});

	describe('packageFilenameFor', () => {
		it('produces a slug + timestamp + extension filename', () => {
			const date = new Date('2026-08-07T18:30:00.000Z');
			expect(packageFilenameFor('Museum Salon', date)).toMatch(
				/^museum-salon-20260807-1830\.museumpack\.zip$/
			);
		});

		it('falls back to default name when documentTitle is empty', () => {
			const date = new Date('2026-08-07T08:05:09.000Z');
			expect(packageFilenameFor('', date)).toMatch(
				/^museum-scene-20260807-0805\.museumpack\.zip$/
			);
		});
	});
});
