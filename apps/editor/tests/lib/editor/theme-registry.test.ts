import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { THEME_IDS, THEME_STORAGE_KEY } from '$lib/editor/theme.svelte';

const APP_HTML = fileURLToPath(new URL('../../../src/app.html', import.meta.url));

/**
 * CI pin between the theme registry and the pre-hydration boot allowlist in
 * app.html. Adding a theme with a forgotten allowlist entry (or vice versa)
 * fails here instead of causing a flash/fallback on reload.
 */
describe('theme bootstrap allowlist ↔ registry sync', () => {
	const source = readFileSync(APP_HTML, 'utf8');

	it('keeps the app.html boot allowlist in exact sync with THEMES', () => {
		const markers = source.match(
			/THEME_IDS_SYNC_WITH_THEME_REGISTRY start([\s\S]*?)THEME_IDS_SYNC_WITH_THEME_REGISTRY end/
		);
		expect(markers, 'boot script must carry the THEME_IDS sync markers').not.toBeNull();
		const list = markers![1]!.match(/var THEME_IDS = \[([^\]]*)\]/);
		expect(list, 'boot script must declare THEME_IDS between the markers').not.toBeNull();
		const bootIds = list![1]!
			.split(',')
			.map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
			.filter((entry) => entry.length > 0);
		expect(bootIds).toEqual(THEME_IDS);
	});

	it('boots from the same storage key and falls back safely', () => {
		expect(source).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
		expect(source).toMatch(/try\s*\{[\s\S]*?dataset\.theme[\s\S]*?\}\s*catch/);
		expect(source).toContain(`'${THEME_IDS[0]}'`);
	});
});