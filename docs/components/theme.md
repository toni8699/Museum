# Editor themes

**Read when:** theme switching, `data-theme`, token theming rules, adding a new theme.  
**Last reviewed:** 2026-09-04 (seven themes incl. the first LIGHT identity; chromatic role inks ratified theme-aware as full `light-dark()` pairs)

---

## Current status

The editor ships **seven named themes**: `navy-blue` (the canonical default —
the dark blue shell from Design-specs §7), three single-temperature curated
chrome palettes, and three multi-tonal palettes that deliberately block
contrasting color families. All leave every spatial invariant untouched.

```text
navy-blue           → canonical dark-blue shell (default)
salon-espresso      → Jazz Kissa / Parisian salon — roasted cacao, smoked bronze
electric-plum       → pop-art vernissage — bruised cassis, royal violet
acid-moss           → brutalist zine studio / botanical pavilion — blackened lichen
porcelain-atelier   → LIGHT: Bauhaus archival art book — warm French porcelain
                      chassis, terracotta/persimmon accent, cobalt metrics
synth-sunset        → Miami vernissage / Risograph duotone — midnight indigo,
                      hot electric-coral accent, ice-cyan metrics
velvet-kodachrome   → 70s analog cinema console — smoked teak, goldenrod
                      marigold accent, dusty patina-teal borders
```

`porcelain-atelier` is the first **light** identity: it sets
`color-scheme: light`, authors light chrome surfaces, and lets the
centralized `light-dark()` base ramp flip to dark ink automatically — the
wiring proof described below. Its status hexes (`--editor-success/warning/
danger` + `--editor-danger-fg`) are re-inked for porcelain; softs/borders keep
their translucent treatment.

Every theme also carries its own **chrome accent family** — the interactive
hue of chrome controls (active pills, outline/primary buttons, tree arrows,
focus rings, dirty badges) and of the timeline path/playhead. Spatial
selection and 3D overlays keep the brand-blue tokens regardless (below):

```text
navy-blue          → accent #2f8cff   (hover #55a1ff,  pressed #1976df)
salon-espresso     → brass #e0a458    (hover #eebd7c,  pressed #c1833a)
electric-plum      → violet #c07ef0   (hover #d6a2f6,  pressed #9c5cd6)
acid-moss          → lime #aecb75     (hover #c2dc92,  pressed #8fb05c)
porcelain-atelier  → terracotta #d94826 (hover #ee5835, pressed #b83a1d)
synth-sunset       → electric coral #ff5a43 (hover #ff7561, pressed #e0432e)
velvet-kodachrome  → marigold #e5a93c (hover #f3bf5d,  pressed #c48d2a)
```

Treat the palette hex values as tunable swatches pending visual review, not
locked final design. Known swatch caveats under review: in the light theme,
muted text on `bg-hover`/`bg-control` porcelain tints reads ~3.6–4.0:1 and
small terracotta accent text ~3.9:1 — legible but below strict 4.5; the
designer-authored light-member timecodes for the dark palettes (navy/moss
ambers) also sit ~3:1 on white and need amber-700 tuning when porcelain-level
light QA starts.

The theme **wiring** is complete: a registry-driven `data-theme` attribute
on `<html>`, a pre-hydration boot script (no flash), localStorage
persistence, and a theme menu in the app bar that lists `THEMES` and checks
the active theme.

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
  'navy-blue': { label: 'Navy Blue', colorScheme: 'dark' },
  'salon-espresso': { label: 'Salon Espresso', colorScheme: 'dark' },
  'electric-plum': { label: 'Electric Plum', colorScheme: 'dark' },
  'acid-moss': { label: 'Acid Moss', colorScheme: 'dark' }
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
axis X/Y/Z + gizmo colors
selection outline / hover / fill / handle  (spatial selection stays
                                            brand blue in every theme)
layout box + hover
plan paper + plan semantic colors
timeline lane parameter colors (fov / look / roll / envelope / free)
```

These carry spatial or data-viz meaning and must not change with the chrome.
The 3D subset (axes/gizmo/selection/layout) is mirrored in `scene-palette.ts`
and pinned by its contract test; plan and timeline-lane colors live in CSS
tokens (`tokens.css`, `plan.css`) under the same never-override rule.
Timeline **path + playhead** are deliberately not in this list — they follow
the chrome accent family below.

**Theme-aware — chrome + viewport utility widgets:**

```text
surfaces (--editor-bg-app/panel/panel-raised/control/hover/selected)
borders (subtle / normal / strong)
base text — centralized at :root as light-dark() pairs, never overridden (below)
chromatic role inks — --editor-text-tint / -tint-soft / -metric / -timecode /
  -success: light-dark() pairs at :root (navy); themes MAY re-author them as
  full pairs (see below)
chrome accent family (--editor-accent/-hover/-pressed/-soft/-border) — the
  interactive hue of chrome controls; each theme derives its own ramp while
  spatial selection/axes keep their brand-blue tokens
--editor-timeline-path / --editor-timeline-playhead (follow the chrome accent)
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

**Text has two layers.** The **base ramp** — `--editor-text-primary /
-secondary / -muted / -disabled` — is declared **once** at `:root` (navy is
the default font-color wiring for every theme) as
`light-dark(light-ink, light-on-dark)` pairs keyed to `color-scheme`. All
shipped themes set `color-scheme: dark`, so they resolve the light-on-dark
member; muted (`#94A3B8`) is tuned so the small meta tier clears 4.5:1 on
every dark chrome surface, selected tints included. A future light theme
authors light chrome surfaces and sets `color-scheme: light` — base text
flips to the dark-ink member automatically. Base tokens must never be
overridden by theme blocks.

Above the base sits the **chromatic role inks** — the non-monochrome
typography system:

```text
--editor-text-tint         uppercase labels & meta take the theme's color
                           temperature (navy = cool slate; salon-espresso =
                           parchment; electric-plum = lilac; acid-moss =
                           lichen/celadon)
--editor-text-tint-soft    one tier quieter than tint
--editor-text-metric       technical numbers (lengths, speeds, coordinates)
--editor-text-timecode     timeline times ("00:08.375") — amber by default
--editor-text-success      readable status text ("Valid"), distinct from the
                           --editor-success glyph/border family
```

These are the one text exception themes may re-author (each curated palette
defines its own tint/metric/timecode temperatures as full `light-dark()`
pairs). The rule for any override is the same as everywhere else: a full
`light-dark()` pair with both members, never a single hex, so a future
light theme still flips correctly.

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
   surfaces/borders + the chrome accent family incl. timeline path/playhead +
   orientation widget). Set `color-scheme: dark` (light-on-dark text via the
   centralized `light-dark()` ramp) — or, for a future light theme,
   `color-scheme: light` + light chrome surfaces, and base text flips to
   dark ink automatically. Never override the base `--editor-text-*` ramp or
   the invariant spatial palette; optionally author the chromatic role inks
   (tint/tint-soft/metric/timecode) as full `light-dark()` pairs. The three
   shipped palettes at the end of `tokens.css` are the working example of
   the pattern.
3. **Boot allowlist line** — add the id inside the
   `THEME_IDS_SYNC_WITH_THEME_REGISTRY` markers in `app.html`.
   `theme-registry.test.ts` then proves registry ↔ allowlist sync.

Design rule: the palette of a new theme is a design decision — author actual
values with review (chrome surfaces, borders, status variants, shadows; plan
paper and 3D overlays stay unchanged; the base text ramp stays centralized,
chromatic role inks optional as full pairs — see the theme-aware section).
Every theme must also
author its own chrome accent ramp (base/hover/pressed readable on its own
surfaces) and its own timeline path/playhead — do not carry over the navy
brand-blue ramp, which stays reserved for spatial selection via its
invariant tokens. The three curated palettes shipped here were authored as
full design submissions against these rules; any future palette remains a
Design-specs §7/§8 decision (visual-language authority), not a mechanism
change — this page documents the mechanism only.