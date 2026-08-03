import { describe, expect, it } from 'vitest';
import { isSafeTextureUri } from './texture-uri';

describe('texture URI policy', () => {
	it.each([
		'/textures/plaster-warm/map.png',
		'/museum/textures/wall detail.webp',
		'/museum/textures/%E2%9C%93.webp'
	])('accepts safe root-relative path %s', (uri) => {
		expect(isSafeTextureUri(uri)).toBe(true);
	});

	it.each([
		'',
		'textures/map.png',
		'//cdn.example/map.png',
		'https://example.com/map.png',
		'blob:abc',
		'data:image/png;base64,abc',
		'file:///tmp/map.png',
		'/../map.png',
		'/%2e%2e/map.png',
		'/%252e%252e/map.png',
		'/./map.png',
		'/path\\map.png',
		'/map.png?cache=1',
		'/map.png#fragment',
		'/%E0%A4%A'
	])('rejects unsafe texture URI %s', (uri) => {
		expect(isSafeTextureUri(uri)).toBe(false);
	});
});
