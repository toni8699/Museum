import { beforeEach, describe, expect, it } from 'vitest';

import {
	applyTheme,
	DEFAULT_THEME,
	initTheme,
	readStoredTheme,
	setTheme,
	THEME_IDS,
	THEMES,
	THEME_STORAGE_KEY,
	themeState,
	type ThemeDocTarget
} from '$lib/editor/theme.svelte';

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
		expect(THEME_IDS).toEqual(['navy-blue']);
		expect(THEME_STORAGE_KEY).toBe('editor.theme');
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
});