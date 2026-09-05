import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	applyTheme,
	DEFAULT_THEME,
	initTheme,
	readStoredTheme,
	refreshViewportPalette,
	setTheme,
	THEME_IDS,
	THEMES,
	THEME_STORAGE_KEY,
	themeState,
	viewportPalette,
	type ThemeDocTarget
} from '$lib/editor/theme.svelte';

const TOKENS_CSS = fileURLToPath(new URL('../../../src/lib/editor/styles/tokens.css', import.meta.url));

function fakeDoc(): ThemeDocTarget {
	return { documentElement: { dataset: {} } };
}

function fakeStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		values
	};
}

describe('editor theme registry + controller', () => {
	beforeEach(() => {
		themeState.current = DEFAULT_THEME;
	});

	it('defines the navy-blue identity and stable registry lists', () => {
		expect(THEMES['navy-blue']).toEqual({ label: 'Navy Blue', colorScheme: 'dark' });
		expect(DEFAULT_THEME).toBe('navy-blue');
		expect(THEME_IDS).toEqual([
			'navy-blue',
			'salon-espresso',
			'electric-plum',
			'acid-moss',
			'porcelain-atelier',
			'synth-sunset',
			'velvet-kodachrome'
		]);
		expect(THEME_STORAGE_KEY).toBe('editor.theme');
	});

	it('ships the curated chrome palettes as dark identities', () => {
		expect(THEMES['salon-espresso']).toEqual({ label: 'Salon Espresso', colorScheme: 'dark' });
		expect(THEMES['electric-plum']).toEqual({ label: 'Electric Plum', colorScheme: 'dark' });
		expect(THEMES['acid-moss']).toEqual({ label: 'Acid Moss', colorScheme: 'dark' });
	});

	it('ships the multi-tonal palettes, incl. the first light identity', () => {
		expect(THEMES['porcelain-atelier']).toEqual({ label: 'Porcelain Atelier', colorScheme: 'light' });
		expect(THEMES['synth-sunset']).toEqual({ label: 'Synth Sunset', colorScheme: 'dark' });
		expect(THEMES['velvet-kodachrome']).toEqual({ label: 'Velvet Kodachrome', colorScheme: 'dark' });
	});

	it('reads a stored theme and falls back on unknown or unavailable storage', () => {
		expect(readStoredTheme(fakeStorage({ 'editor.theme': 'navy-blue' }))).toBe('navy-blue');
		expect(readStoredTheme(fakeStorage({ 'editor.theme': 'purple' }))).toBe(DEFAULT_THEME);
		expect(readStoredTheme(fakeStorage({}))).toBe(DEFAULT_THEME);
		const throwing = {
			getItem: () => {
				throw new Error('blocked');
			}
		};
		expect(readStoredTheme(throwing)).toBe(DEFAULT_THEME);
	});

	it('initTheme applies the stored theme, syncs state, and returns the id', () => {
		const doc = fakeDoc();
		const id = initTheme(fakeStorage({ 'editor.theme': 'navy-blue' }), doc);
		expect(id).toBe('navy-blue');
		expect(doc.documentElement.dataset.theme).toBe('navy-blue');
		expect(themeState.current).toBe('navy-blue');
	});

	it('initTheme with unknown stored value applies the default', () => {
		const doc = fakeDoc();
		const id = initTheme(fakeStorage({ 'editor.theme': 'purple' }), doc);
		expect(id).toBe(DEFAULT_THEME);
		expect(doc.documentElement.dataset.theme).toBe(DEFAULT_THEME);
	});

	it('setTheme applies, persists, and rejects unknown ids', () => {
		const doc = fakeDoc();
		const storage = fakeStorage();
		setTheme('navy-blue', storage, doc);
		expect(themeState.current).toBe('navy-blue');
		expect(doc.documentElement.dataset.theme).toBe('navy-blue');
		expect(storage.values.get(THEME_STORAGE_KEY)).toBe('navy-blue');

		const before = themeState.current;
		setTheme('purple' as never, storage, doc);
		expect(themeState.current).toBe(before);
		expect(storage.values.get(THEME_STORAGE_KEY)).toBe('navy-blue');
	});

	it('survives storage failures when persisting', () => {
		const doc = fakeDoc();
		const throwing = {
			setItem: () => {
				throw new Error('quota');
			}
		};
		expect(() => setTheme('navy-blue', throwing, doc)).not.toThrow();
		expect(doc.documentElement.dataset.theme).toBe('navy-blue');
	});

	it('applies state without a document (SSR-safe)', () => {
		expect(() => applyTheme('navy-blue')).not.toThrow();
		expect(themeState.current).toBe('navy-blue');
	});

	describe('3D viewport canvas palette', () => {
		it('mirrors the navy :root defaults from tokens.css (first declaration)', () => {
			const css = fs.readFileSync(TOKENS_CSS, 'utf8');
			expect(viewportPalette).toEqual({
				background: '#071019',
				gridMajor: '#8d753c',
				gridMinor: '#37342d'
			});
			// The :root declarations are the light-dark() pairs the palette
			// resolves; keep the token names and navy members pinned.
			expect(css).toMatch(/--editor-bg-viewport:\s*light-dark\(#ddd7ce,\s*#071019\);/i);
			expect(css).toMatch(/--editor-viewport-grid-major:\s*light-dark\(#b1aca5,\s*#8d753c\);/i);
			expect(css).toMatch(/--editor-viewport-grid-minor:\s*light-dark\(#cbc6be,\s*#37342d\);/i);
		});

		it('stays SSR-safe: refresh is a no-op without a document', () => {
			expect(typeof document).toBe('undefined');
			expect(() => refreshViewportPalette()).not.toThrow();
			expect(viewportPalette.background).toBe('#071019');
		});
	});
});