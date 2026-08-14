import { describe, expect, it } from 'vitest';
import { sniffImageMime } from '$lib/editor/helpers/mime-sniff';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
const WEBP_BYTES = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('sniffImageMime', () => {
	it('detects PNG signatures', () => {
		expect(sniffImageMime(PNG_BYTES)).toBe('image/png');
	});

	it('detects WebP (RIFF/WEBP) signatures', () => {
		expect(sniffImageMime(WEBP_BYTES)).toBe('image/webp');
	});

	it('detects JPEG signatures', () => {
		expect(sniffImageMime(JPEG_BYTES)).toBe('image/jpeg');
	});

	it('returns null for unsupported byte layouts', () => {
		expect(sniffImageMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
		expect(sniffImageMime(new Uint8Array())).toBeNull();
	});

	it('returns null when bytes look PNG-like but are too short to confirm', () => {
		expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
	});
});
