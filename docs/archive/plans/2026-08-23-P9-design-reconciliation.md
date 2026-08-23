# P9 — Design reconciliation before P2

**Date:** 2026-08-23  
**Status:** Shipped 2026-08-23 — docs/PNG-only reconciliation complete  
**Tracker:** [`docs/plans/README.md`](../../plans/README.md) — **P9**, depends on: P7 + P8

## Outcome

Live shell docs, design specs, active plans, and `Design-png/` tell one current
story. Newer shipped shell/design decisions replace older guidance instead of
surviving beside it as amendments. One lowercase canonical PNG set remains;
Git history preserves removed concepts.

## Decisions

- Shared `Plan | 3D` axis; domain changes never restore another domain's view.
- Shell swaps are instant. Camera timeline default is `288px`, collapsed `48px`.
- Timeline displays five semantic lanes over the current two-lane backing model.
- Camera topology is undirected; arrows appear only for directed preview/playback.
- Preview vocabulary is Camera / Edge / Sequence.
- Scene Plan always exposes `Layout | Staging` on one local toolbar surface.
- Blue `#2F8CFF` is the sole active/selection accent on the charcoal shell.
- P4 distinguishes import lifecycle from curation status.

## Shipped work

1. Rewrote live docs/specs and P2/P3/P4 plan language to the decisions above.
2. Replaced duplicated PNG tables with `Design-png/README.md` as the active
   visual registry.
3. Normalized all active PNGs to lowercase kebab-case; removed four redundant
   Camera concepts; regenerated 27 sketches against locked Scene Plan,
   Scene 3D, Camera Plan, and Camera 3D shells.
4. Removed the live P1.8 design brief after folding useful guidance into
   canonical specs and the visual registry.

## Verification

- 27 canonical PNGs reviewed at original resolution;
- stale terminology/rules and superseded live PNG names: zero matches;
- every active PNG registry entry resolves; filenames are lowercase kebab-case
  and unique;
- `git diff --check` clean;
- no runtime/source/test file belongs to P9; source test baseline was not rerun
  because this slice changes Markdown and raster assets only.
