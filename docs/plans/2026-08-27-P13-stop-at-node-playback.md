# P13 — Sequence stop-at-node playback (proposed, nice-to-have)

**Status:** `proposed` — registered but deliberately **not scheduled** (owner
2026-08-27). Nice to have, not needed right now; P12 shipped 2026-08-28 and it
now waits behind the remaining P3B.7a/P3B.8 hard-gate tail.
**Tracker:** [`README.md`](README.md) — **P13**, depends on: P12.
**Placement:** Product-level idea with a known design; no owner decision pending
beyond scheduling. Registered now so the design and its P12 contract notes are
captured before the gate closes.
**Baseline:** P12 frozen contract + shipped P12 S1–S4 baseline (P11.4 + fixes).

---

## Goal

In **Sequence scope**, Play travels to the **beginning of the next node** and
stops there, instead of running the whole tour end-to-end. A toggle switches
between stop-at-node and full continuous playback (today's behavior).

Pinned semantics (owner clarification 2026-08-27): for `A → B → C`,

```text
▶ from A  →  travels A→B  →  stops at the beginning of B
▶ again   →  travels B→C  →  stops at the beginning of C
▶ again   →  continues to the tail, or loops when a closing edge exists
```

"Beginning of a node" = the moment the camera arrives at the node — the end of
the inbound edge's motion span, i.e. the start of the node's authored hold. This
automates the P12 §3 static-inspection path (`Sequence → seek(nodeBoundary) →
paused`) during playback.

## Current behavior

Sequence playback is a single linear sweep: the rig tick
(`EditorCameraRig.svelte` `useTask`) advances the normalized playhead by
wall-clock time across the whole timeline (motion spans + holds), then completes
at `playhead = 1` (P12 S1 completion semantics). No stop-at-node concept exists
anywhere in the FSM.

## Why this is a small change (no rewrite)

1. **Node positions are already data.** `timeline.nodeBoundaries`
   (`camera/editor-camera-timeline.ts`) already holds each node's arrival
   `progress`; the paused `step()` transport already enumerates them as
   breakpoints.
2. **One clock.** The playhead advances only in the rig tick. With the flag on,
   clamp progress at the next boundary and call `pauseCameraPreview()` instead
   of continuing to `1`; Play resumes from the boundary (existing
   `playCameraPreview` resumes from the current playhead).
3. **Toggle precedent.** Clone the `edgeRepeat` pattern: `$state` on
   `EditorCameraPreviewController` + setter + reset in stop/prune/release,
   facade getter/setter, and a header icon + `More`-menu item shown only in
   Sequence scope.

## Files (est. ~100 lines across 5 files)

| File | Change |
| :--- | :--- |
| `camera/editor-camera-timeline.ts` | Pure helper: next node-boundary progress after a playhead (+ unit tests) |
| `store/camera-preview-controller.svelte.ts` | `$state` flag + setter + resets, beside `edgeRepeat` |
| `camera/EditorCameraRig.svelte` | Tick clamp + pause (~10 lines) |
| `hooks/use-camera-timeline.svelte.ts` + `camera/EditorCameraTimelineFrame.svelte` | Toggle surface (header + `More` menu, Sequence scope) |
| `editor-store.svelte.ts` | Facade delegates |

No changes to the timeline data model, sampling, persistence, history, preview
kinds, or the FSM transport states.

## P12 contract notes

- **Binary transport preserved.** Transport stays strictly `playing | paused`
  (P12 §2); the pause is auto-triggered at a boundary, not a third state.
- **Not a repeat flag.** No conflict with P12 §3.6 ("Sequence never gains a
  session repeat flag"); but it *is* new Sequence transport grammar, so it needs
  its own §2/§6 contract note if it is ever folded into P12 (it is not — see
  Status).
- **Toggle placement.** Per P12 §6 compact priority, the toggle may live in the
  header or in the `More` overflow (secondary controls move there first).
- **Flag locality.** Mirrors Edge Repeat: reads false and resets outside
  Sequence scope.

## Acceptance pins (when implemented)

- ▶ in Sequence scope with stop-at-node on travels to the next node boundary and
  pauses; the camera sits at the node's arrival pose.
- ▶ resumes to the following boundary; the final play completes at `playhead 1`
  (P12 S1 completion).
- Toggle off = today's continuous end-to-end behavior, unchanged.
- Works in POV and Observer (P12 §4 mode-independent transport).
- Relic stays frozen (`!store.isRelic` gating, per P12 §6 S4).
- Flag reads false / resets outside Sequence scope (edgeRepeat locality
  pattern).

## Status

Proposed, **not scheduled**. P12 shipped 2026-08-28; P3B.7a/P3B.8 is the
remaining hard gate. P14, not P13, is first scheduled after the gate; promote
P13 only by a later owner decision.
