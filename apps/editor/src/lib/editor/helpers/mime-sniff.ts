/**
 * `editor/helpers/mime-sniff.ts` — light image MIME sniffer used by the
 * Phase 5.4 package exporter.
 *
 * **Pure module**. Identifies a supported image MIME from the magic bytes
 * at the head of the buffer:
 *
 * - PNG: begins with `89 50 4E 47 0D 0A 1A 0A`.
 * - WebP: begins with `52 49 46 46 ? ? ? ? 57 45 42 50`.
 * - JPEG: begins with `FF D8 FF`.
 *
 * Returns `null` for any other byte layout. The exporter uses this so that
 * the manifest's `mime` matches the actual bytes (image-format trust).
 */

import type { SupportedMime } from '@portfolio/project-model';

export const PROJECT_ASSET_MAX_BYTES = 25 * 1024 * 1024;

export function sniffImageMime(bytes: Uint8Array): SupportedMime | null {
	if (bytes.length >= 8) {
		const b0 = bytes[0];
		const b1 = bytes[1];
		const b2 = bytes[2];
		const b3 = bytes[3];
		const b4 = bytes[4];
		const b5 = bytes[5];
		const b6 = bytes[6];
		const b7 = bytes[7];
		if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47 && b4 === 0x0d && b5 === 0x0a && b6 === 0x1a && b7 === 0x0a) {
			return 'image/png';
		}
	}
	if (bytes.length >= 12) {
		const b0 = bytes[0];
		const b1 = bytes[1];
		const b2 = bytes[2];
		const b3 = bytes[3];
		const b8 = bytes[8];
		const b9 = bytes[9];
		const b10 = bytes[10];
		const b11 = bytes[11];
		if (
			b0 === 0x52 &&
			b1 === 0x49 &&
			b2 === 0x46 &&
			b3 === 0x46 &&
			b8 === 0x57 &&
			b9 === 0x45 &&
			b10 === 0x42 &&
			b11 === 0x50
		) {
			return 'image/webp';
		}
	}
	if (bytes.length >= 3) {
		const b0 = bytes[0];
		const b1 = bytes[1];
		const b2 = bytes[2];
		if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) {
			return 'image/jpeg';
		}
	}
	return null;
}
