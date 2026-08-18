# Camera framing authoring — adopted model (C′)

**Status:** adopted spec — design review closed 2026-08-18. Resolves the open
questions in `2026-08-18-camera-framing-design-review.md`.
**Audience:** implementers of serialization/API, authoring UX, motion sampler, and tests.

## 1. TL;DR

Each transition direction keeps two stable layers — an **automatic travel-facing
baseline** and the **authored framing track** — and an envelope weight `w(p)`
blends between them. Nodes remain the canonical endpoints of every transition:
the envelope controls *influence*, never *endpoint ownership*. No
transition-endpoint overrides. Option B is reserved for a future
arrival/departure-shot feature and is deliberately out of scope now.

## 2. The model

```
eye(p)    = positionPath(p)                                  // unchanged
target(p) = lerp(autoTarget(p), authoredTarget(p), w(p))
fov(p)    = lerp(autoFov(p), authoredFov(p), w(p))

w(p) = enterRamp(p) × exitRamp(p)                            // fixed smootherstep ramps
```

- `autoTarget` — existing travel-facing look-ahead path (2-samples-ahead, gaze
  level-clamped to `min(eye height, 1.5 m)`).
- `autoFov` — existing node-FOV interpolation.
- `authoredTarget` / `authoredFov` — existing track: `node → breakpoints → node`,
  with per-interval easing and holds untouched. The envelope is an **outer blend**,
  not a replacement.
- Eye position is shared by both layers — only framing (look target + fov) blends.

Envelope serialization, per direction, on the existing view track:

```ts
framingEnvelope: {
  enterStart: number
  enterEnd: number
  exitStart: number
  exitEnd: number
}
```

with `0 ≤ enterStart ≤ enterEnd ≤ exitStart ≤ exitEnd ≤ 1`. One canonical
smootherstep implementation is shared by editor preview and runtime so
what-you-author-is-what-plays cannot drift. Degenerate ramps are allowed
(`enterStart = enterEnd` = instant ramp); the ordering invariant is validated.

## 3. Behavioral contract

- **No keys** → existing automatic behavior, unchanged.
- **Existing keys + no envelope** → legacy `w = 1`, playback unchanged.
- **New first key** → auto-create envelope: enter ramp, plateau through the
  authored region, **exit pinned at `1`** (authored framing persists to the end
  of the move, so "arrive at the desired framing" works by default).
- **Later keys** → envelope auto-expands to contain them while auto-managed.
- **Designer moves any handle** → envelope becomes manual; breakpoint edits no
  longer move its bounds.
- **Exit `< 1`** → explicit "resume auto-facing before arrival" (interior-shot
  authoring).
- **"Full authored transition" command** → effectively `w = 1`, the discoverable
  escape hatch for legacy-style authoring of new content.
- **`p = 0` / `p = 1`** → canonical node pose whenever both layers coexist.

## 4. Canonical-endpoint invariant

> Whenever automatic and authored framing coexist on a direction, both evaluate
> to the same node-owned pose at progress 0 and 1. Therefore **any blend weight
> produces the canonical node pose at transition boundaries**.

Exact for the whole pose, not just framing: `eye(0)` = path start = node A;
`target(0) = lerp(nodeA, nodeA, w(0)) = nodeA`; `fov(0)` likewise. Same at
`p = 1` for node B.

Consequence: the envelope needs **no endpoint constraints on `w`** — `w(0)` and
`w(1)` may be anything and node continuity still holds. This is the property that
keeps C′ clean: the envelope controls influence, not endpoint ownership, which is
what avoids the Option B problem.

**Scoping:** reversed transitions with no reverse-direction keys keep today's
`travelFacingEnds` behavior (all samples travel-facing). No authored layer exists
in that case, so the envelope does not apply and the invariant is not invoked.
Do not "simplify" this away — it intentionally avoids the turn-around read at the
start of a reverse move. Adding the first reverse key flips auto endpoints to node
poses, after which the invariant holds.

## 5. Migration and defaults

- **Absent `framingEnvelope` = legacy full-authored (`w = 1`).** No data
  migration; old files are not rewritten with `{w:1}`. New authoring always
  writes the envelope explicitly, so "absent" is only ever reachable by legacy
  content and has exactly one meaning.
- **New authoring follows the new product vision:** the first framing breakpoint
  auto-creates a blend envelope. Making new breakpoints default to `w = 1` would
  give designers the old all-or-nothing behavior unless they discover the
  envelope control — the exact UX the feature exists to fix.
- **Auto-managed vs manual envelope:** until the designer manually edits an
  envelope handle, adding/moving breakpoints automatically expands the envelope
  as needed to contain them. After any envelope-handle edit, the envelope becomes
  manual and breakpoint edits no longer move its bounds.
- Exact initial ramp width is UI tuning, not model semantics.

## 6. Decision log — what was rejected and why

- **Option B endpoint overrides** — hidden state-dependent precedence (the
  meaning of an unset start pose changes when an unrelated key exists),
  per-edge inconsistency for shared nodes, and it silently solves a problem the
  product has not proven (arrival-dependent poses). Parked behind an explicit
  future arrival/departure-shot feature.
- **Editable weight curve** — another mini animation editor; harder
  serialization, validation, and undo; a constrained envelope is deterministic
  and upgradeable to a custom curve later without breaking the schema.
- **Breakpoints at progress 0/1** — three definitions of one logical pose; every
  downstream feature (gizmos, serialization, preview, reverse traversal, undo,
  validation) pays precedence tax.
- **FOV-only transition endpoints first** — a scalar FOV override still breaks
  node authority at arrival (discontinuity, or accidental arrival blending);
  same semantic risk as full endpoint overrides. FOV ships through the same
  envelope as look.
- **Symmetric exit default for new envelopes** — would solve "start rotating from
  auto" but break "arrive at desired framing" by default. Exit defaults to `1`.

## 7. FOV semantics (fix from the brief)

Larger FOV = **wider / zoomed out**; smaller FOV = **tighter / zoomed in**. The
brief's example ("starts zoomed out at 40°, ends framed at 70°") is backwards;
the likely intent is "starts wide ~70°, gradually frames the subject at ~40°."
Standardize wording in UI and specs; avoid "expand" unless the UI uses that word.

## 8. Out of scope (this model)

- **Arrival/departure shots** (explicit per-edge arrival poses) — future
  feature, only if real authoring evidence demands it. The exit ramp may compose
  with it later.
- **Custom weight curves** — additive upgrade path only.
- **C1 (derivative) continuity through nodes** — C0 is guaranteed by the
  invariant; motion-layer tuning later if ever needed.
- **Exact envelope default widths and handle UX** — product/UI tuning.

## 9. Next work

1. **Serialization/API:** `framingEnvelope` field shape, ordering validation,
   per-direction placement on existing view tracks, absent-field semantics.
2. **Sampler:** implement `w(p) = enterRamp × exitRamp` blending in
   `sampleCameraMotion`; absent envelope → legacy path; verify playback is
   unchanged for existing content.
3. **Tests:** canonical-endpoint invariant (any `w` → node pose at 0/1) across
   forward / reversed-with-keys / reversed-no-key edges; legacy absent-field
   behavior; auto-managed envelope expansion; degenerate-envelope validation.
4. **Authoring UX:** envelope band with enter/exit handles, one-gesture push-in,
   "Full authored transition" command.

## Appendix — verified against shipped code

- One key flips a transition from auto-facing to fully authored:
  `hasAuthoredKeyframes = track.keyframes.length > 0` gates `sampleAuthoredView`
  in `camera-motion.ts`; the view track is `[node start pose, ...keys, node end pose]`.
- Auto baseline endpoints are node poses (indices 0 and last of
  `buildLookAheadTargets` in `camera-route.ts`) for forward edges and
  reversed-with-keys edges; `travelFacingEnds` applies only to reversed edges
  with no reverse keys.
- Breakpoint progress is compared against arc-length (distance-based) local
  progress, so envelope percentages map to travelled distance, not spline
  parameter weirdness.
