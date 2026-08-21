# P3 — UI overhaul (umbrella)

**Date:** 2026-08-18
**Status:** Approved (2026-08-18 scope decision §6) — scope pinned; **retargeted to the canonical specs 2026-08-19**
**Tracker:** [`docs/plans/README.md`](README.md) — **P3**, depends on: P1, P2

## Canonical targets (2026-08-19)

The specs below are **canonical** and define the overhaul's target state:

- **Visual:** [`Design-specs.md`](../Design-specs/Design-specs.md) — tokens,
  typography, icons, spacing, radii, shell dimensions, per-surface rules.
  Its color system (blue accent `#2F8CFF` on blue-tinted chrome) is the
  overhaul's palette and **supersedes the S10.1.7 gold/charcoal tokens**
  (`#d6b35f` accents on `#0b0b10` / `#1a1a22` surfaces) landed earlier in
  the working tree. The spec's §37 token architecture — six files under
  `src/lib/editor/styles/` (`tokens.css`, `editor-shell.css`, `controls.css`,
  `inspector.css`, `timeline.css`, `plan.css`) — does not exist yet; P3.2
  creates all six.
- **Exposure:** [`Design-shell-specs.md`](../Design-specs/Design-shell-specs.md)
  — workspace ownership, capability routing, non-leakage rules. P1 §A.2
  holds the current conformance mapping; P3 inherits it unchanged.
- **QA ground truth:** the generated UI concepts in
  [`Design-png/`](../../Design-png/) (repo root, `Scene/` + `Camera/`) — the
  sketches the visual spec normalizes. P3.1 QAs the live shell against both
  the sketches and the spec.

## Outcome

A single **reconciliation/refresh pass** over the settled surfaces — not an
open-ended redesign. The product stays visually raw through P1 + P2; this is
the refresh that follows them. P3 moves the editor from the interim S10.1.7
visual state to the canonical `Design-specs.md` state.

## Scope (pinned)

- **Covers:** the domain×view shell (P1.1), Camera Plan (P1.5), framing UX
  surfaces (P1.6), and Plan-staging surfaces (P2) — everything P1 + P2 added,
  reconciled to the canonical specs above (replacing the earlier
  "reconcile with the S10.1.7 tokens" baseline).
- **Must not:** change behavior contracts, restructure the shell, or re-polish
  during P1/P2 (the P1.7 light pass covers interim presentation).

## Increments

| ID | Content | Depends |
|---|---|---|
| **P3.1** | Visual QA: `Design-png/` sketches + `Design-specs.md` vs the live shell (sketch → surface mapping below); recorded deviation list | P1, P2 |
| **P3.2** | Token / typography / icon reconciliation to `Design-specs.md` §5–§7 + §37 — incl. creating the full six-file `styles/` directory (`tokens.css`, `editor-shell.css`, `controls.css`, `inspector.css`, `timeline.css`, `plan.css`) and migrating editor chrome off the S10.1.7 gold/charcoal to the blue-tinted system | P3.1 |
| **P3.3** | Non-behavioral defect-fix pass (visual only) | P3.2 |

### P3.1 sketch → surface mapping

| Sketch | Surface | Note |
|---|--:|---|
| `Design-png/Scene/Scene-2D.png` | Scene → Plan (incl. P2 staging) | |
| `Design-png/Scene/Plan-Staging.png` | Staging footprint states (P2) | |
| `Design-png/Scene/Empty-staging.png` | Empty staging state | |
| `Design-png/Scene/Empty-plan.png` | Empty plan state | |
| `Design-png/Scene/Scene-3D.png` · `Scene-3D-2.png` · `Scene-3D-assets.png` | Scene → 3D + asset library | |
| `Design-png/Scene/Scene-Object-Inspector.png` | Inspector | |
| `Design-png/Camera/Camera-2D.png` | Camera → Plan (P1.5) | **keep — minor convention only** (sketch shows `Free Cameras / →` / editable `Y`; docs canonical `Unsequenced / — / Y preserved` per `Camera-flow-specs.md §2`, `Shell §4`/`§9` — P3.1 logs deviation, no PNG edit) |
| `Design-png/Camera/Camera-3D.png` | Camera → 3D | **keep — minor convention only** (`Free → Unsequenced` per `Camera-flow-specs.md §2`) |
| `Design-png/Camera/Framing-Authoring-3D.png` | Framing authoring (P1.6) | **redesign left 30%** — viewport/inspector envelope keep; left `Shots 01-08` → `Sequence Inspector / Unsequenced / Connections` per `Shell §4` (see `P1.8-designer-brief.md §2`) |
| `Design-png/Camera/Camera-sequence.png` · `Camera-sidebar.png` | Camera sidebar / sequence | `Camera-sequence.png` **keep — minor** (`Free → Unsequenced`); `Camera-sidebar.png` **redesign** — 8-shot model → canonical 4-section sidebar per `Shell §4` |
| `Design-png/Camera/Timeline-expanded.png` | Camera Timeline expanded (P1.6) | **keep — minor** (`Free → Unsequenced`); lanes `Camera Path/Shots/FOV/Look At/Roll` keep (`Shell §12`) |
| `Design-png/Camera/Collapsed-camera.png` | Camera Timeline collapsed | **redesign** — sketch duplicates framing viewport; needs true `48px` collapsed strip per `Shell §12` |
| `Design-png/Camera/Sequence-reroot.png` · `New-Camera-flow-plan.png` · `Unsequenced-branch.png` | P1.8 Camera flow (Sequence re-root / branch) | **keep — minor** (new P1.8 truth; docs note `→` → `—`, `Measure`/`Yaw/Y` vs `Shell §4/§9/§16`, timing label `Shell §9` gap — sketch kept as-is) |
| `Design-png/Scene/Asset management.png` | Asset management (deferred, out of P3 scope) | |

## Decisions (2026-08-19)

- **Token naming — unified to the `--editor-` prefix.** The editor has no
  existing CSS-token convention (colors are inline hex today), so names are
  namespaced to avoid colliding with the host app or the `/museum` visitor.
  `Design-specs.md` §7–§11 and §37 now use one scheme.
- **Full styles directory lands in P3.2.** All six files in §37 (`tokens.css`
  + five surface stylesheets) are P3.2 scope, not deferred.
- **Relic repaints with shared components; behavior stays frozen.** The relic
  and editor share most chrome (AppBar, Inspector, timeline frame, dialogs,
  tree/field primitives), so a token migration repaints both. Decoupling would
  mean forking those components or maintaining a parallel gold palette — not
  worth it for a frozen shell slated for removal. Only core *functionality* is
  frozen; the relic may change color.
- **Dependencies decided at implementation time.** `bits-ui` (headless
  primitives) and Inter Variable may be added during P3.2 as needed; neither
  is a gating decision.
- **Sketches are direction, not pixel-gauges.** `Design-specs.md` normalizes
  the generated concepts into tokens; exact hues are fine-tuned during
  P3.1/P3.2. Color divergence from a PNG is not a defect.
- **Alternate palette available as an option.** `Design-specs.md` §7 documents
  "Vault & Lens" (warm gallery brass for Scene, cool lens cyan for Camera) as
  an optional theme. Theme switching is a future expansion: cheap for DOM
  chrome + SVG (swap `--editor-*` values), needs a small JS bridge for
  Three.js overlays.

## Designer requests — fulfilled (2026-08-19)

All requested sketches delivered and verified in `Design-png/`:

| # | Request | Sketch delivered |
|---|---|---|
| 1 | Scene → Plan — Staging footprint states | `Scene/Plan-Staging.png` |
| 2 | Camera → 3D — Framing authoring | `Camera/Framing-Authoring-3D.png` |
| 3 | Collapsed Camera Timeline | `Camera/Collapsed-camera.png` |
| 4 | Boot / empty states | `Scene/Empty-plan.png` (updated) + `Scene/Empty-staging.png` |
| 5 | Camera Sidebar (4 sections) | `Camera/Camera-sidebar.png` (updated) |
| 6 | Asset management (optional) | `Scene/Asset management.png` — delivered, out of P3 scope |

## Spec conformance boundary

"Matches `Design-specs.md`" is scoped as follows so P3's DoD stays bounded:

- **P3 owns:** visual reconciliation of every *shipped* surface — §5 (icons),
  §6 (typography), §7–§11 (tokens), §12–§20 (spacing, radii, chrome,
  controls), §22–§26 (toolbar/timeline/inspector/tree), §29–§35 (selection,
  motion, status, shortcuts), §37 (token architecture).
- **Shipped by P1/P2, conformance inherited** (not rebuilt): §1–§3 (stack),
  the shell/workspace model and capability matrix — owned by P1 §A.2 and P2 §B.
- **Out of P3 scope (deferred surfaces):** §4 "command menu later", §8/§21
  wider asset-management state, and any §24/§26 timeline detail not built by
  P1.6/P1.7.

## Definition of done (P3 close)

- One visual QA vs the `Design-png/` sketches + `Design-specs.md` with
  recorded deviations; token/typography/icon state matches `Design-specs.md`
  §5–§7 / §37 (no S10.1.7 gold accents left in editor chrome); **no
  behavioral drift**; suite green, `svelte-check` 0, build clean; tracker
  marks **P3 shipped**.
