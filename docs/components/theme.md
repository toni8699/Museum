# Editor themes

**Read when:** theme switching, `data-theme`, token theming rules, adding a new theme.  
**Last reviewed:** 2026-09-03 (theme wiring; P21 Row 1 placement ratified)

---

## Current status

The editor ships **one named theme: `navy-blue`** (the canonical identity —
the dark blue shell from Design-specs §7). The theme **wiring** is complete:
a registry-driven `data-theme` attribute on `<html>`, a pre-hydration boot
script (no flash), localStorage persistence, and a theme menu in the app bar.
With a single theme the menu shows one checked entry ("Navy Blue"); no visual
change is observable until a second theme is authored.

```text
theme.svelte.ts          → THEMES registry + controller (state, apply, persist)
app.html                 → pre-hydration boot script (marker-synced allowlist)
styles/tokens.css        → :root = navy-blue base; [data-theme='<id>'] overrides
app/EditorAppBar.svelte  → theme menu (lists THEMES automatically)
EditorApp / MuseumEditorApp → initTheme() on mount
tests/lib/editor/theme.test.ts           → registry/controller behavior
tests/lib/editor/theme-registry.test.ts  → app.html allowlist ↔ registry sync pin
```

Source: [`editor/theme.svelte.ts`](../../apps/editor/src/lib/editor/theme.svelte.ts).

**P21+ target placement** (Design-Plan §C.1): the picker moves to Row 1
far-right as a palette icon immediately before Account Profile —
`[↺ ↻] [▶ Preview] [Theme] [Avatar]`. Theme is a global presentation
preference, not a project document action, so it never enters the
persistence cluster or the Workspace Ribbon; today it lives in the pre-P21
app bar actions.

## How it works

`THEMES` is the single source of truth for theme ids and labels:

```ts
export const THEMES = {
  'navy-blue': { label: 'Navy Blue', colorScheme: 'dark' }
} as const;
```

- `themeState.current` (stable `$state` object — never export reassigned
  `$state`) holds the active id; `setTheme(id)` validates, applies
  `data-theme` to `<html>`, and persists to `localStorage['editor.theme']`.
- `initTheme()` (called on mount by both editor shells) reads storage,
  validates against `THEMES`, and falls back to `navy-blue` on unknown values
  or storage failure (private browsing / storage restrictions never break
  editor boot; SSR-safe — no module-top-level `document`/`localStorage`).
- The `app.html` boot script runs before hydration, between the
  `THEME_IDS_SYNC_WITH_THEME_REGISTRY` markers, so the correct theme applies
  before first paint. The script's allowlist is pinned to `THEMES` by
  `theme-registry.test.ts` (exact set equality — a forgotten allowlist entry
  fails CI).

### Visitor isolation

The `data-theme` attribute may exist globally on `<html>`, so `/museum`
technically carries it too. **Theme styling and state ownership remain
editor-only**: the visitor never imports `tokens.css` or the theme
controller and consumes none of the theme CSS, so its rendering is
unaffected by any `data-theme` value. Do not import theme machinery into the
visitor lane.

## Theme surface split (the rules)

`tokens.css` (`:root`) remains the canonical navy-blue base and keeps the
**first** declaration of every token — the scene-palette contract test
(`tests/lib/editor/styles/scene-palette.test.ts`) matches the first
`--editor-<name>: #hex;` declaration, so the base must never be reordered or
restructured (one exception today: `--editor-danger-fg`, see below).

**Invariant — spatial interaction palette, identical in every theme, never
overridden:**

```text
accent family (--editor-accent/-hover/-pressed/-soft/-border)
axis X/Y/Z + gizmo colors
selection outline / hover / fill / handle
layout box + hover
plan paper + plan semantic colors
```

These carry spatial meaning (mirrored in `scene-palette.ts` for Three.js
materials) and must not change meaning with the chrome.

**Theme-aware — chrome + viewport utility widgets:**

```text
surfaces (--editor-bg-app/panel/panel-raised/control/hover/selected)
borders (subtle / normal / strong)
text (primary / secondary / muted / disabled)
status soft + border variants, --editor-danger-fg
shadows / elevation, color-scheme
orientation widget (surface / hover / border / label / face lit/mid/shadow /
edge-solid / face-hover/pressed)
future P21 row-1/row-2 shell bands (--editor-bg-row-1 / --editor-bg-row-2,
proposed in Design-Plan §C.3) are chrome by rule — theme-aware when they land
```

The orientation box is a pure-CSS DOM widget (`EditorOrientationGizmo.svelte`
reads CSS variables only), so it themes for free — it is not part of the
Three.js palette and not covered by the scene-palette contract.

One hygiene exception: `--editor-danger-fg` is defined in
`styles/controls.css`, not `tokens.css` (a `:root[data-theme='…']` override
still wins by specificity, so themes can already override it). Parked — move
it into `tokens.css` during theme #2 or the next token cleanup so the
canonical file truly holds every theme-aware token.

## Adding a future theme — three steps

Theme names are specific identities (no generic "dark"/"light"). Adding a
theme is deliberately additive; the CI pin makes the three steps safe:

1. **Registry entry** — add the id + label to `THEMES` in
   `editor/theme.svelte.ts` (e.g. `'porcelain': { label: 'Porcelain',
   colorScheme: 'light' }`). The app-bar menu lists it automatically.
2. **CSS override block** — append `:root[data-theme='<id>'] { … }` at the
   end of `styles/tokens.css`, overriding **only theme-aware tokens** (chrome
   + orientation widget, plus `color-scheme`). Never override the invariant
   spatial palette. An illustrative (non-shipped) example block already
   documents the pattern at the end of `tokens.css`.
3. **Boot allowlist line** — add the id inside the
   `THEME_IDS_SYNC_WITH_THEME_REGISTRY` markers in `app.html`.
   `theme-registry.test.ts` then proves registry ↔ allowlist sync.

Design rule: the palette of a new theme is a design decision — author actual
values with review (chrome surfaces, borders, text, status variants,
shadows; plan paper and 3D overlays stay unchanged). Do not create new
tokens for a theme unless a semantic genuinely needs one; prefer reusing the
accent family or existing semantic tokens. Palette ratification for a second
theme is a Design-specs §7/§8 decision (visual-language authority), not a
mechanism change — this page documents the mechanism only.