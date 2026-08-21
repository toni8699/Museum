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
  — workspace ownership, capability routing, non-leakage rules (split 2026-08-21 → [`Shell-camera-workspaces.md`](../Design-specs/Shell-camera-workspaces.md) §9–13 + [`Shell-scene-workspaces.md`](../Design-specs/Shell-scene-workspaces.md) §6–8; § numbers preserved). P1 §A.2
  holds the current conformance mapping; P3 inherits it unchanged.
- **QA ground truth:** the generated UI concepts in
  [`Design-png/`](../../Design-png/) (repo root, `Scene/` + `Camera/`) — the
  sketches the visual spec normalizes. P3.1 QAs the live shell against both
  the sketches and the spec. **Update 2026-08-21:** 2 new PNGs `Camera-3D-Framing-new.png` + `Camera-3D-timeline-expanded.png` added; `Collapsed-camera.png` → `camera-timeline-collapsed.png`, `Camera-sidebar.png` → `camera-sidebar.png`/`Side-bar.png` (case-alias).

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
| `Design-png/Camera/Framing-Authoring-3D.png` | Framing authoring (P1.6) alt concept | **archived — superseded by `Camera-3D-Framing-new.png` delivered 2026-08-21** (viewport/inspector envelope `Safe Frame 90%` / `Framing Envelope 14%→86%` keep; old left `Shots 01-08` non-canonical) |
| `Design-png/Camera/Camera-sequence.png` · `Camera-sidebar.png` (old) | Camera sidebar / sequence alt concept | `Camera-sequence.png` **keep — minor** (`Free → Unsequenced`); old `Camera-sidebar.png` (capital C) **archived — superseded by `camera-sidebar.png` (lowercase) + `Side-bar.png` delivered 2026-08-21** — canonical 4-section `Environment / Sequence Inspector / Unsequenced / Connections` per `Shell §4` |
| `Design-png/Camera/camera-sidebar.png` · `Side-bar.png` | Camera sidebar 4-section (Aug 21) | **delivered 2026-08-21** — canonical `Environment / Sequence Inspector / Unsequenced / Connections` per `Shell §4`; `A — B` undirected; `Side-bar.png` shows `Drop a camera here` empty state (P1.8 §6) |
| `Design-png/Camera/Timeline-expanded.png` | Camera Timeline expanded (P1.6) | **keep — minor** (`Free → Unsequenced`); lanes `Camera Path/Shots/FOV/Look At/Roll` keep (`Shell §12`) — now correctly shown in `Camera-3D-timeline-expanded.png` |
| `Design-png/Camera/Camera-3D-timeline-expanded.png` | Camera Timeline expanded canonical (Aug 21) | **delivered 2026-08-21** — canonical 5 lanes `Camera Path / Shots / FOV / Look At / Roll` per `Shell §12` (`Design-specs §24`); `Sequence Path B→C→D` vs `Branch E`, legends `TIMELINE (Sequence only)` + `SEQUENCE MODEL` + timing `B—C 4.2s / C—D 5.1s` + branch pill |
| `Design-png/Camera/camera-timeline-collapsed.png` | Camera Timeline collapsed 48px (Aug 21) | **delivered 2026-08-21** — true `48px` collapsed strip `Tour + Play/Pause/Follow/Recenter/Stop + Snap + time + Zoom + Collapse` per `Shell §12` (`Design-specs §16`); old `Collapsed-camera.png` missing on disk — ref updated |
| `Design-png/Camera/Camera-3D-Framing-new.png` | Framing authoring redo (Aug 21) | **delivered 2026-08-21** — supersedes `Framing-Authoring-3D.png` left 30%; viewport `Safe Frame 90% / Subject Frame / Focus Target` + `Framing Envelope 14%→86% / Focus Timing / Lens 24/35/50/85 / Parallax Warning` keep (P1.6); left now canonical 4-section |
| `Design-png/Camera/Sequence-reroot.png` · `New-Camera-flow-plan.png` · `Unsequenced-branch.png` | P1.8 Camera flow (Sequence re-root / branch) | **keep — minor** (new P1.8 truth; docs note `→` → `—`, `Measure`/`Yaw/Y` vs `Shell §4/§9/§16`, timing label `Shell §9` gap — sketch kept as-is) |
| `Design-png/Camera/Side-bar.png` · `Unsequence-Sequenced.png` · `Remove-from-sequence.png` · `Remove-sequence.png` · `Camera-preview-connection.png` · `Path-edit.png` · `Timeline-sequence-only.png` | P1.8 missing canvases batch (Aug 21) | **delivered 2026-08-21** — `Side-bar.png` §6 empty `Drop a camera here`, `Remove-*.png` §12 + §16/17 remove/delete protection, `Camera-preview-connection.png` §18 Preview, `Path-edit.png` §15 keeps seq, `Timeline-sequence-only.png` §19 Sequence-only + branch pill; per `P1.8-designer-brief.md §3` (only insert zones §7+§11 remain) |
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

## Designer requests — fulfilled (2026-08-19; updated 2026-08-21)

All requested sketches delivered and verified in `Design-png/`; Aug 21 batch added P1.8 coverage:

| # | Request | Sketch delivered |
|---|---|---|
| 1 | Scene → Plan — Staging footprint states | `Scene/Plan-Staging.png` |
| 2 | Camera → 3D — Framing authoring | `Camera/Framing-Authoring-3D.png` (alt concept) → **superseded by `Camera/Camera-3D-Framing-new.png` (2026-08-21)** — canonical 4-section sidebar + correct framing envelope |
| 3 | Collapsed Camera Timeline | `Camera/Collapsed-camera.png` (missing) → **superseded by `Camera/camera-timeline-collapsed.png` (2026-08-21)** — true `48px` strip per `Shell §12` |
| 4 | Boot / empty states | `Scene/Empty-plan.png` (updated) + `Scene/Empty-staging.png` |
| 5 | Camera Sidebar (4 sections) | `Camera/Camera-sidebar.png` (old, archived) → **superseded by `Camera/camera-sidebar.png` (lowercase) + `Camera/Side-bar.png` (2026-08-21)** — canonical `Environment / Sequence Inspector / Unsequenced / Connections`; `Side-bar.png` also covers P1.8 §6 empty `Drop a camera here` |
| 6 | Asset management (optional) | `Scene/Asset management.png` — delivered, out of P3 scope |
| 7 | P1.8 Camera flow — re-root / branch (new 2026-08-21) | `Camera/Sequence-reroot.png` + `Camera/New-Camera-flow-plan.png` + `Camera/Unsequenced-branch.png` — keep minor convention only |
| 8 | P1.8 Missing canvases — remove / delete / preview / path-edit / timeline-sequence-only (new 2026-08-21) | `Camera/Remove-from-sequence.png` + `Remove-sequence.png` + `Unsequence-Sequenced.png` (§12, §16/17) + `Camera-preview-connection.png` (§18) + `Path-edit.png` (§15) + `Timeline-sequence-only.png` (§19) — only `§7+§11 Insert zones` remains |
| 9 | Camera Timeline expanded canonical (new 2026-08-21) | `Camera/Camera-3D-timeline-expanded.png` — canonical 5 lanes `Camera Path / Shots / FOV / Look At / Roll` per `Shell §12` / `Design-specs §24` + `Sequence Path vs Branch` + `SEQUENCE MODEL` legends; interim `camera-sidebar.png` 2-lane `Sequence/Notes` is simplified view, not canonical |

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
  P1.6/P1.7. **Note 2026-08-21:** 5-lane `Camera Path / Shots / FOV / Look At / Roll` (`Design-specs §24` / `Shell §12`) is **cosmetic in P3** — visual split of current 2-lane `Guided Route / Camera Framing` (`EditorCameraTimelineDots.svelte:556`), ground truth `Camera-3D-timeline-expanded.png`; `Shots` (no entity, derived) and `Roll` (`0°` quiet, `editor-camera-view.ts:136` not representable) have no store model yet.

## Definition of done (P3 close)

- One visual QA vs the `Design-png/` sketches + `Design-specs.md` with
  recorded deviations; token/typography/icon state matches `Design-specs.md`
  §5–§7 / §37 (no S10.1.7 gold accents left in editor chrome); **no
  behavioral drift**; suite green, `svelte-check` 0, build clean; tracker
  marks **P3 shipped**.
