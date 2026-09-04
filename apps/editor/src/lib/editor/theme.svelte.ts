/*
 * Editor theme registry + controller.
 *
 * Named theme identities (no generic "dark"/"light"). Shipped themes:
 * `navy-blue` (canonical default) plus the curated chrome palettes
 * `salon-espresso`, `electric-plum`, `acid-moss` and the multi-tonal
 * `porcelain-atelier` (the first LIGHT identity), `synth-sunset`,
 * `velvet-kodachrome`. A future theme is one THEMES entry + one
 * `:root[data-theme='<id>']` override block at the end of
 * styles/tokens.css + one entry in the app.html boot allowlist (the last is
 * CI-pinned by tests/lib/editor/theme-registry.test.ts).
 *
 * Theme surface split (tokens.css header is authoritative):
 *  - The spatial interaction palette — axes, gizmo, selection outline/fill/
 *    handle, layout box, plan paper + plan semantics, timeline lane
 *    parameter colors — is INVARIANT in every theme (the 3D subset is
 *    mirrored in scene-palette.ts and pinned by the scene-palette contract
 *    test; never override it per theme). Spatial selection keeps its
 *    brand-blue tokens in every theme.
 *  - Chrome surfaces/borders, the chrome accent family (--editor-accent*,
 *    incl. --editor-timeline-path/-playhead), and viewport utility widgets
 *    (orientation box) are theme-aware. The BASE text ramp is declared once
 *    at :root as light-dark() pairs (navy default wiring) and follows
 *    `color-scheme` — theme blocks never override it; a future light theme
 *    flips color-scheme and base text flips to dark ink. Chromatic role inks
 *    (--editor-text-tint/-soft, -metric, -timecode, -success) may be
 *    overridden per theme as full light-dark() pairs.
 *
 * The `data-theme` attribute may exist globally on <html> (the /museum
 * visitor technically carries it too); theme styling and state ownership
 * remain editor-only — the visitor never imports tokens.css or this
 * controller.
 *
 * SSR-safe: no module-top-level document/localStorage access, and every
 * storage access is failure-tolerant (private-browsing / storage
 * restrictions must never break editor boot).
 */

export const THEMES = {
	'navy-blue': { label: 'Navy Blue', colorScheme: 'dark' },
	'salon-espresso': { label: 'Salon Espresso', colorScheme: 'dark' },
	'electric-plum': { label: 'Electric Plum', colorScheme: 'dark' },
	'acid-moss': { label: 'Acid Moss', colorScheme: 'dark' },
	'porcelain-atelier': { label: 'Porcelain Atelier', colorScheme: 'light' },
	'synth-sunset': { label: 'Synth Sunset', colorScheme: 'dark' },
	'velvet-kodachrome': { label: 'Velvet Kodachrome', colorScheme: 'dark' }
} as const;

export type ThemeId = keyof typeof THEMES;

export const DEFAULT_THEME: ThemeId = 'navy-blue';

export const THEME_STORAGE_KEY = 'editor.theme';

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * Stable state object. Svelte 5 rune modules have sharp edges around
 * exported `$state` that gets reassigned, so mutations happen only through
 * the functions below; consumers read `themeState.current`.
 */
export const themeState = $state({ current: DEFAULT_THEME as ThemeId });

/** Minimal structural view of the document we write `data-theme` onto. */
export interface ThemeDocTarget {
	documentElement: { dataset: Record<string, string | undefined> };
}

function isThemeId(value: string | null | undefined): value is ThemeId {
	return value !== null && value !== undefined && (THEME_IDS as readonly string[]).includes(value);
}

function getDocument(): ThemeDocTarget | null {
	return typeof document === 'undefined' ? null : document;
}

/** Read the persisted theme; unknown values and storage failures fall back to the default. */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): ThemeId {
	try {
		const stored = (storage ?? globalThis.localStorage)?.getItem(THEME_STORAGE_KEY);
		return isThemeId(stored) ? stored : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

/** Apply a theme id: sync state and set `data-theme` on <html> (SSR-safe). */
export function applyTheme(id: ThemeId, doc?: ThemeDocTarget | null): void {
	themeState.current = id;
	const target = doc ?? getDocument();
	if (target) target.documentElement.dataset.theme = id;
}

/** Boot-time init: read the persisted theme, validate, apply. Returns the active id. */
export function initTheme(storage?: Pick<Storage, 'getItem'>, doc?: ThemeDocTarget | null): ThemeId {
	const id = readStoredTheme(storage);
	applyTheme(id, doc);
	return id;
}

/** User-facing switch: validate, apply, persist. Persistence failure is harmless. */
export function setTheme(
	id: ThemeId,
	storage?: Pick<Storage, 'setItem'>,
	doc?: ThemeDocTarget | null
): void {
	if (!isThemeId(id)) return;
	applyTheme(id, doc);
	try {
		(storage ?? globalThis.localStorage)?.setItem(THEME_STORAGE_KEY, id);
	} catch {
		// Storage unavailable — the in-session theme still applies.
	}
}