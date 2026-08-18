# Geometry kernel — library packaging review

**Status:** review artifact, not an implementation plan. **Date:** 2026-08-15.
Incorporates a doc-only external review (2026-08-15); accepted findings folded into §3–§7, decisions in §11.
Round-4 execution addendum (corrected hardened spec) in §12 — supersedes §10 where they conflict.
Positioning addendum (discovery review) in §13; §8 pitch language corrected to match §5.3.
Release-scope addendum (round 6) in §16; §13/§14 hero revised to plain-language-first.
Extraction-timing gate state in §17 (G1 already shipped — Step 2 unblocked).
**Scope:** decide whether the pure 2D geometry kernel in `apps/museum/src/lib/layout/`
is worth extracting as a standalone npm package, and what that package would be.

## 1. TL;DR

Two files — `layout-geometry-curve.ts` (604 LOC) and `layout-geometry-openings.ts`
(226 LOC) — form aself-contained **2D path geometry engine**: centripetal auto-Bézier interpolation, adaptive flatness-based sampling, sampled-distance (chord) parameterization with O(log n) queries, closest-point projection, polyline intersection, parametric arch profiles, and wall-segment splitting around openings.

They are already pure (no Svelte, Three, DOM, or browser APIs — enforced by the
G1 plan), have **zero dependencies**, and their numerical output is pinned by
golden tests. The only document coupling is three small types that can be
generalized without touching algorithm bodies.

**Recommendation: yes — this is the one part of the codebase that is both generic
enough and already proven to be a publishable library. Everything else
(codecs, render bridge) stays app-owned.**

## 2. Context

- Repo: npm workspaces monorepo (`apps/*`, `packages/*`). Existing internal
  packages are all `"private": true`, source-exported `.ts`, no build step —
  a publish would need build tooling, LICENSE, README, and `private` removal.
- The kernel lives under `$lib/layout/**`, which the G1 plan
  (`docs/plans/2026-08-13-graphics-g1-shared-geometry-compiler.md`) already
  constrains to be renderer-neutral: nothing in the compiler graph may import
  `$lib/editor/**`, Svelte, DOM/SVG, browser APIs, Threlte, or Three.js.
- It is the geometry core of a floor-plan editor (rooms, walls, openings) whose
  compiled output feeds both the editor 3D preview and the visitor runtime.
- The museum-specific document schemas (`LayoutDocument` v3, `SceneDocument` v6,
  `.museumpack`) and the JSON→render bridge are **not** extraction candidates —
  they are app-locked and intentionally coupled (AGENTS.md rule 4).

## 3. Proposed package

| | |
|---|---|
| Name | `@spatial-sketch/geometry-kernel` (workspace-internal first; publishable later) |
| Deps | none (Node 20+ / browser, ESM) |
| Units | plain numbers; callers own the unit (kernel was written in meters) |
| Exports | two subpath entrypoints: `@spatial-sketch/geometry-kernel/curve` and `/openings` (plus a types barrel) |
| Test spine | move `tests/lib/layout/layout-geometry*.test.ts` + golden fixtures with it |

**Entrypoint split (review decision).** The package exposes two independent
exports, not one blob. The split is free in the current code: `openings`
already consumes `curve` outputs (`SampledSegment`, `CurveSample`) and never
weaves wall logic into the spline math, so the boundary is exactly the existing
file boundary. A CAD/SVG/robotics consumer pulls only `/curve`; an
architectural tool pulls `/openings` on top.

## 4. Public API surface (as it exists today)

Types (from `layout-geometry-curve.ts`, `layout-geometry-openings.ts`,
`layout-types.ts`):

```ts
export type LayoutVec2 = [number, number];                       // → library Vec2
export type CurveSample = {
  point: LayoutVec2; distance: number; tangent: LayoutVec2; normal: LayoutVec2; t: number;
};
export type SampledSegment = { segmentId: string; length: number; samples: CurveSample[] };
export type CurveDistanceResult = { point: LayoutVec2; distance: number; tangent: LayoutVec2; normal: LayoutVec2; t: number };
export type DraftSegment =
  | { id: string; kind: 'line'; start: LayoutVec2; end: LayoutVec2 }
  | { id: string; kind: 'auto-bezier'; start: LayoutVec2; end: LayoutVec2; interiorAnchors: LayoutInteriorAnchor[] };
```

Curve kernel (all exported from `layout-geometry-curve.ts`):

```ts
export function compileAutoBezierAnchors(points: readonly LayoutVec2[]): CubicBezierShape[];
export function cubicBezierPoint(segment: CubicBezierShape, t: number): LayoutVec2;
export function cubicBezierDerivative(segment: CubicBezierShape, t: number): LayoutVec2;
export function segmentPointAt(segment: DraftSegment, t: number): LayoutVec2;
export function segmentTangentAt(segment: DraftSegment, t: number): LayoutVec2;
export function segmentLength(segment: DraftSegment): number;
export function sampleSegment(segment: DraftSegment, options?: {
  flatnessTolerance?: number; maxSampleSpan?: number; maxDepth?: number; maxSamples?: number;
}): SampledSegment;
export function pointAtDistance(sampled: SampledSegment, distanceAlong: number): CurveDistanceResult;
export function pointAlongSamples(samples: readonly CurveSample[], distanceAlong: number): LayoutVec2;
export function samplePolylineInRange(samples: readonly CurveSample[], startDistance: number, endDistance: number): LayoutVec2[];
export function projectPointToSampledSegment(point: LayoutVec2, sampled: SampledSegment): CurveDistanceResult & { distanceToPath: number };
export function sampledPolylineIntersects(first: readonly CurveSample[], second: readonly CurveSample[], tolerance?: number, ignoreSharedEndpoint?: LayoutVec2): boolean;
export function sampledPolylineSelfIntersects(samples: readonly CurveSample[], tolerance?: number): boolean;
```

Opening kernel (all exported from `layout-geometry-openings.ts`):

```ts
export function buildArchProfile(kind: 'rectangular' | 'rounded' | 'pointed', width: number, height: number, epsilon?: number): ArchProfileResult;
export function archProfileTopAt(profile: ArchProfile, x: number): number;
export function openingIntervals(segment: DraftSegment, openings: readonly LayoutOpening[]): WallOpeningInterval[];
export function splitWallAroundOpenings(segment: DraftSegment, openings: readonly LayoutOpening[], wallHeight: number): CompiledWallSection[];
export function splitSampledWallAroundOpenings(sampled: SampledSegment, segment: DraftSegment, openings: readonly LayoutOpening[], wallHeight: number): CompiledWallSection[];
export function wallPolylinesAroundOpenings(samples: readonly CurveSample[], openings: readonly Pick<LayoutOpening, 'offset' | 'width'>[]): LayoutVec2[][];
export function samplesInDistanceRange(samples: readonly CurveSample[], startDistance: number, endDistance: number): LayoutVec2[];
```

**Symbol mapping (review decision).** `/curve` exports: `compileAutoBezierAnchors`,
`cubicBezierPoint`, `cubicBezierDerivative`, `sampleSegment`, `pointAtDistance`,
`pointAlongSamples`, `samplePolylineInRange`, `projectPointToSampledSegment`,
`sampledPolylineIntersects`, `sampledPolylineSelfIntersects`, `segmentPointAt`,
`segmentTangentAt`, `segmentLength`, plus the `Vec2`, `SampledSegment`,
`CurveSample`, `CurveDistanceResult`, `CubicBezierShape` types. `/openings`
exports: `buildArchProfile`, `archProfileTopAt`, `openingIntervals`,
`splitSampledWallAroundOpenings`, `splitWallAroundOpenings`,
`wallPolylinesAroundOpenings`, `samplesInDistanceRange`, plus the
`WallOpeningInterval`, `CompiledWallSection`, `ArchProfile` types.

## 5. Core ideas (why this is library-worthy)

### 5.1 Centripetal auto-Bézier through an arbitrary polyline

Any polyline of `Vec2`s becomes a smooth C¹ spline of cubic Béziers using
centripetal parameterization (`α = 0.5`), with tangent estimation from
previous/next distinct points. Handles 0-, 1-, and 2-point degenerates:

```ts
export const LAYOUT_AUTO_BEZIER_ALPHA = 0.5;

function centripetalInterval(from: LayoutVec2, to: LayoutVec2): number {
  return Math.pow(distance(from, to), LAYOUT_AUTO_BEZIER_ALPHA);
}

function createAutomaticTangent(points: readonly LayoutVec2[], index: number): LayoutVec2 {
  const point = points[index]!;
  const previous = nearestDistinctPoint(points, index, -1);
  const next = nearestDistinctPoint(points, index, 1);
  if (!previous && !next) return [0, 0];
  if (!previous) {
    const interval = centripetalInterval(point, next!);
    return divide(subtract(next!, point), interval);
  }
  if (!next) {
    const interval = centripetalInterval(previous, point);
    return divide(subtract(point, previous), interval);
  }
  const previousInterval = centripetalInterval(previous, point);
  const nextInterval = centripetalInterval(point, next);
  const incoming = scale(subtract(point, previous), nextInterval / previousInterval);
  const outgoing = scale(subtract(next, point), previousInterval / nextInterval);
  return divide(add(incoming, outgoing), previousInterval + nextInterval);
}
```

The compiled cubic list is what `cubicBezierPoint`/`cubicBezierDerivative`
evaluate. A later `legacyBezierToAutoBezier` migrates authored Bézier segments
by sampling their midpoint — that is a persistence-migration algorithm and must
stay versioned, not be rewritten (G1 plan note).

**Cusp caveat (review decision).** `createAutomaticTangent` enforces C¹
continuity at every anchor, so a polyline meant to have a 90° corner gets
aggressively rounded. The app sidesteps this by modeling straight walls as
`kind: 'line'` segments; the generic `Vec2[]` API must document that sharp
corners require splitting into separate paths (or adding a `corner` segment
kind).

### 5.2 Adaptive flatness sampling with hard budgets

`adaptiveParameters` recursively subdivides until the midpoint's distance to
the chord falls under `flatnessTolerance` **and** the chord is under
`maxSampleSpan`, bounded by `maxDepth`. Every failure mode is a typed error
code, and finite-input/length checks run before sampling:

```ts
export const CURVE_FLATNESS_TOLERANCE = 0.01;     // meters, G1-locked
export const CURVE_MAX_SAMPLE_SPAN = 0.25;        // meters, G1-locked
export const MAX_CURVE_SAMPLES_PER_SEGMENT = 100_000;

function adaptiveParameters(segment, flatnessTolerance, maxSampleSpan, maxDepth): number[] {
  const result: number[] = [0];
  function visit(t0: number, t1: number, depth: number): void {
    const p0 = cubicBezierPoint(segment, t0);
    const p1 = cubicBezierPoint(segment, t1);
    const tm = (t0 + t1) / 2;
    const pm = cubicBezierPoint(segment, tm);
    const flatness = distanceToLine(pm, p0, p1);
    const chord = distance(p0, p1);
    if (depth < maxDepth && (flatness > flatnessTolerance || chord > maxSampleSpan)) {
      visit(t0, tm, depth + 1);
      visit(tm, t1, depth + 1);
      return;
    }
    result.push(t1);
  }
  visit(0, 1, 0);
  return [...new Set(result)].sort((a, b) => a - b);
}
```

**Unit defaults → named preset (review decision).** The defaults above are
G1-frozen for the museum, but a unitless library must not silently ship meter
defaults: a mm caller gets runaway subdivision, a px caller gets pointless
sub-pixel sampling. Export an explicit preset and require callers to pass
options or opt in:

```ts
export const METRIC_METER_PRESETS = {
  flatnessTolerance: 0.01,
  maxSampleSpan: 0.25,
  maxDepth: 12,
  maxSamples: 100_000
} as const;
```

### 5.3 Arc-length parameterization (the hard problem in spline tooling)

Samples accumulate distance monotonically and carry a per-sample tangent +
normal. This is what makes "evenly spaced objects along a curve" tractable:

```ts
function buildSampledSegment(segmentId, pointsWithT, segment): SampledSegment {
  const points = pointsWithT.map((entry) => entry.point);
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1]! + distance(points[index - 1]!, points[index]!));
  }
  const length = distances.at(-1) ?? 0;
  const samples = pointsWithT.map((entry, index) => {
    const tangent = tangentFromSamples(points, index, segment, entry.t);
    return { point: [...entry.point], distance: distances[index]!, tangent,
             normal: [-tangent[1], tangent[0]] as LayoutVec2, t: entry.t };
  });
  return { segmentId, length, samples };
}
```

`pointAtDistance` answers "give me the point 3.7 m along this path" via a
binary search on the monotonic distance array, interpolating point/tangent and
re-deriving the normal — O(log n):

```ts
const target = Math.min(sampled.length, Math.max(0, distanceAlong));
let high = samples.length - 1, low = 0;
while (low < high) {
  const middle = Math.floor((low + high) / 2);
  if (samples[middle]!.distance < target) low = middle + 1;
  else high = middle;
}
// lerp point + tangent between samples[endIndex-1] and samples[endIndex]
```

`projectPointToSampledSegment` gives the closest point on the path with its
distance along path, tangent, normal, and radial distance to the path — the
primitive for path-following and snapping.

**Honesty note (review decisions, corrected round 3).** This is a
*sampled-polyline arc-length cache*, not an analytical spline evaluator. Chord
lengths sum to ≤ true arc length, so every reported `length`/`distance` is a
**secant-chord lower bound**. The flatness tolerance bounds per-sample
*position* deviation (samples lie within `flatnessTolerance` of the spline) —
it does **not** bound cumulative arc-length error: per-segment chord deficits
scale like `(8/3)·(s/c)²` per chord (sagitta `s ≤ flatnessTolerance`, chord
`c ≤ maxSampleSpan`) and accumulate monotonically along the path. At default
tolerances the worst-case envelope is ~0.4% of path length (several cm over a
20 m continuously curving wall); near-straight floor-plan walls are far below
that. `pointAtDistance` interpolates between samples, so tangents and normals
are lerped C⁰ along the path:

```ts
const tangent = normalize(lerp(start.tangent, end.tangent, amount), start.tangent);
```

That is fine for placement and geometry; it is wrong for anything needing
smooth path derivatives (e.g., animation velocity, CNC feed-rate planning).
Do not advertise analytical arc length or C¹ continuity without a re-fit.

### 5.4 Parametric arch profiles + wall sections

`buildArchProfile` turns `(kind, width, height)` into a geometric top boundary
with structured issues (invalid width/height, rounded/pointed rise exceeding
height). Rounded arches are sampled with 16 subdivisions; pointed arches are a
3-point boundary; rectangular is a flat cap:

```ts
export function buildArchProfile(kind, width, height, epsilon = ARCH_PROFILE_EPSILON): ArchProfileResult {
  if (!Number.isFinite(width) || width <= epsilon) return { profile: null, issues: [{ code: 'arch_profile_width_invalid', ... }] };
  if (!Number.isFinite(height) || height <= epsilon) return { profile: null, issues: [{ code: 'arch_profile_height_invalid', ... }] };
  const rise = width / 2;
  if ((kind === 'rounded' || kind === 'pointed') && rise > height + epsilon)
    return { profile: null, issues: [{ code: `${kind}_arch_rise_exceeds_height`, ... }] };
  // 'rectangular' → flat topBoundary; 'pointed' → 3-point boundary;
  // 'rounded' → 16-point semicircular arc on top of the spring height
}
```

`splitSampledWallAroundOpenings` compiles a wall centerline + opening list into
solid spans (side / sill / lintel), clamping to wall height, skipping
zero-width intervals, and attaching the arch profile to lintel sections. It is
the canonical compiled wall model shared by both renderers.

## 6. Numerical invariants (locked by tests)

- `CURVE_ENDPOINT_EPSILON = 1e-6`, `LAYOUT_GEOMETRY_EPSILON = 1e-6`,
  `ARCH_PROFILE_EPSILON = 1e-6`.
- Default sampling: flatness `0.01 m`, max span `0.25 m`, max depth `12`,
  max samples `100_000`. G1-locked for the app; the library exposes them as
  `METRIC_METER_PRESETS` (§5.2) and takes explicit options.
- **Lower bound, not bounded length:** `length` and every `distance` are
  secant-chord sums ≤ true arc length. Flatness bounds per-sample *position*
  deviation only; the integrated arc-length deficit accumulates (~0.4% of path
  length worst-case at default tolerances; far less for near-straight walls)
  (§5.3).
- **Already handled (verified against code):** `archProfileTopAt` clamps `x`
  to `[0, width]` and epsilon-guards its lerp — no NaN path.
  `pointAtDistance`'s binary search always terminates (ties shrink `high`),
  and zero-width spans are guarded by `span > CURVE_ENDPOINT_EPSILON` — no
  division by zero.
- Sampled distances are monotonic; `pointAtDistance` assumes this.
- Tangents are analytic per-cubic; degenerate tangents fall back to a neighbor
  sample chord, then `[1, 0]`.
- **Stationary points:** a cubic with `P′(t) = [0,0]` (cusp/inflection) yields a
  zero analytic tangent; `tangentFromSamples` falls back to the previous-sample
  chord, or `[1, 0]` when the neighbor coincides. Deterministic, but the
  tangent/normal at a true cusp is geometrically ambiguous — expect a normal
  "flicker" across the cusp. Non-blocking for floor plans; noted for
  CNC/animation consumers.
- `t` across a multi-cubic spline is piecewise (`(cubicIndex + localT) / n`),
  **not** arc-length uniform — distance queries must go through `distance`,
  never through `t`.
- Self-intersection skips adjacent samples and honors a shared-endpoint
  exemption (tolerance `1e-4`, scaled per segment length in orientation tests).
- Golden tests (`layout-geometry-golden.test.ts`) and parity tests
  (`layout-geometry-parity.test.ts`) pin numerical output; these move with the
  package.

## 7. Decoupling (what actually changes)

The kernel's only document coupling, and the exact edits:

```ts
// 1. Vec2 is the primary primitive (review decision): readonly [number, number].
export type Vec2 = readonly [number, number];

// 2. No segment type in the kernel (review decision). The primary API takes a
//    plain Vec2[] polyline (per §5.1); ids are dropped entirely — sampled
//    output order matches input order, callers zip their own keys.
//    SampledSegment.segmentId is removed.

// 3. LayoutOpening → OpeningInput: strip editor-only fields; the kernel reads:
type OpeningInput = { offset: number; width: number; sillHeight: number; height: number;
                      profile: 'rectangular' | 'rounded' | 'pointed' };
//    (id, kind 'door'|'window', segmentId, connectsRoomIds are app concerns)
```

Algorithm bodies do not change. Consumers pass `Vec2[]` + options directly;
the `auto-bezier` segment shape remains only as an internal compatibility
layer for the museum compiler.

## 8. Worked example — external consumer

"Porch Railings": a tool where a user clicks a curved garden boundary and gets
a picket fence with a gate and a window, in any world units. Without this
kernel the hard parts are (a) evenly spaced posts along a Bézier, (b) cutting
openings out of a wall run, (c) arched tops — all three are one-liners here:

The example below uses the **target library API** per the review decisions:
plain `Vec2[]` input (no segment shape), subpath entrypoints, no ids, explicit
sampling options.

```ts
import { samplePolyline, pointAtDistance } from '@spatial-sketch/geometry-kernel/curve';
import { splitSampledWallAroundOpenings, buildArchProfile } from '@spatial-sketch/geometry-kernel/openings';

// User clicks 5 points; we get a smooth centripetal spline through them.
const anchors: Vec2[] = [[0, 0], [4, 1.5], [9, 0.8], [14, 2.2], [20, 1]];
const sampled = samplePolyline(anchors, { flatnessTolerance: 0.01, maxSampleSpan: 0.25 });

// 1. 24 pickets at approximately uniform spacing in sampled distance (a
//    chord lower bound — not analytical arc length; §5.3). Naive t-spacing
//    bunches up on curves.
for (let i = 0; i < 24; i++) {
  const { point, tangent, normal } = pointAtDistance(sampled, (i * sampled.length) / 24);
  placePicket(point, perpendicular(normal), tangent); // normal ⊥ path → post orientation
}

// 2. Cut the gate + window out of the fence run → solid spans to extrude.
//    (Openings are already grouped to this wall by the caller; no ids needed.)
const sections = splitSampledWallAroundOpenings(sampled, [
  { offset: 3.2, width: 1.2, sillHeight: 0, height: 1.0, profile: 'rectangular' }, // gate
  { offset: 8.4, width: 1.5, sillHeight: 0.9, height: 1.2, profile: 'rounded' }    // window
], 1.8); // fence height

// 3. Gothic arch for the gate cap mesh.
const arch = buildArchProfile('pointed', 1.2, 2.4); // → { profile, issues: [] }
```

Other consumer profiles the API directly serves:

- **Procedural builders (games/archviz):** railings, guardrails, gutters, curb
  stones along splines; doors/windows in generated walls — `pointAtDistance` +
  `splitSampledWallAroundOpenings` + `buildArchProfile`.
- **2D CAD / SVG tooling:** dash patterns at exact intervals, text-on-path,
  arrowheads, outline offsetting — `pointAlongSamples` + `samplePolylineInRange`.
- **Robotics / path-following:** closest-point projection for path-following
  error correction via `projectPointToSampledSegment` (closest point +
  tangent/normal + distance). **Not** for constant feed-rate / CNC planning —
  that needs analytical derivatives (§5.3).

## 9. Out of scope (stays app-owned)

- `layout-codec.ts` (v3 JSON), `scene-codec/**` (v6 migrations), `package-format.ts`
  — document formats are app-locked; extract only as a workspace-internal
  "format contract" if a second renderer ever needs them, never as a publish.
- `wall-mesh-builder.ts`, `plan-render-model.ts`, materials, texture cache —
  the JSON→render bridge.
- `editor/store/*.svelte.ts` state machines and `museum/**` visitor code —
  coupled to Svelte 5 runes and museum material types.

## 10. Packaging checklist (if greenlit)

1. New workspace package `packages/geometry-kernel` (ESM, `"files": ["src"]` like
   siblings); move the two kernel files; add subpath exports for `curve` and
   `openings` (per §3/§4), plus a shared types barrel.
2. Apply §7 decoupling; keep algorithm bodies byte-identical.
3. Move `tests/lib/layout/layout-geometry*.test.ts` + golden fixtures; keep the
   museum golden values as fixtures (units stay meters in fixtures).
4. Add a build step (tsup or vite lib mode) + `prepublishOnly` if publishing;
   LICENSE, README with the §8 example.
5. Rewire `$lib/layout/**` (and the G1 compiler) to import from the package.
6. Verify `npm run check` + `npm test` green; re-run golden/parity tests.

## 11. Review outcomes (2026-08-15)

Doc-only external review assessed against the actual code; accepted findings
folded into §3–§7:

| # | Question | Decision |
|---|---|---|
| Q1 | Segment shape vs plain `Vec2[]` | **`Vec2[]` is primary.** Segments stay only as an internal compatibility layer for the museum compiler (§7). |
| Q2 | G1 meter defaults | **Explicit options + `METRIC_METER_PRESETS` constant**; no silent unit defaults (§5.2). |
| Q3 | `id`/`key` on segments | **Dropped entirely.** Output index matches input; callers zip their own keys (§7). |
| Q4 | Package name | **`@spatial-sketch/geometry-kernel`**, workspace-private; keeps namespace control if it is ever published (§3). |
| Q5 | Piecewise `t` | **Keep as-is** for golden-test compatibility; document that `t` is piecewise and never arc-length uniform — rename to something explicit (e.g., `piecewiseT`) in public types only. |

Two review concerns were checked against the code and are **already handled**:
`archProfileTopAt` clamps out-of-bounds `x` with an epsilon-guarded lerp, and
`pointAtDistance`'s binary search terminates on equal distances with an
epsilon guard on span interpolation (§6). The tuple-allocation concern is a
documented caveat — GC pressure at the 100k pathological cap, with a
typed-array mode deferred per G1 — not a blocker.

**Round-3 correction (2026-08-15):** the claim that arc-length error is bounded
by the flatness tolerance was wrong — flatness bounds per-sample *position*
deviation only, not the integrated chord deficit, which accumulates
(worst-case ~0.4% of path length at default tolerances). §5.3/§6 now state
`length`/`distance` as a secant-chord lower bound. The stationary-point
normal-flicker note was folded into §6 (deterministic fallback, geometrically
ambiguous at true cusps, non-blocking).

**Overall verdict:** extract as an internal workspace package now (entrypoint
split, ids dropped, `Vec2[]` primary, explicit presets); **do not publish to
npm** until a demonstrated external consumer exists — the maintenance tax at
~830 LOC is not justified by the (zero) current external utility.

## 12. Execution addendum — corrected round-4 spec (2026-08-15)

The round-4 "hardened" implementation spec adopted all round-2 amendments (a–f)
correctly in its API surface but introduced seven errors — including fabricated
file names and a type rename that contradicted its own no-ripple claim. The
corrections below are verified against the tree; where §10 conflicts, this
section wins.

### 12.1 The seven corrections

1. **`CompiledWallSection` keeps `bottomY`/`topY`/`profileBaseY`.** The rename
   to `bottomZ`/`topZ` is rejected, and `profileBaseY` (the arch-cap base) must
   be kept: `layout-geometry.ts:291-304` (`buildSolidSpans`/`archBottom`) and
   `layout/wall-mesh-builder.ts:548-552, 844` (`sectionBottomAt`, solid
   intervals) read all three. The round-4 spec's "No change needed" was false
   for the very rows it claimed untouched.
2. **No fabricated files.** `layout-compiler.ts` and
   `editor/validation/opening-validator.ts` do not exist. The compiler is
   `layout-geometry.ts`; opening validation lives in
   `layout-geometry-validation.ts`. Real paths: `layout/wall-mesh-builder.ts`
   (not `render/`), `render/wall-geometry-adapter.ts` (not `layout/`).
3. **`openingId` needs an id source.** `OpeningInput` gains optional
   `key?: string`; the museum passes the layout opening id through so
   `CompiledWallSection.openingId` stays populated (mesh correlation depends on
   it). The id-less `OpeningInput` + kept `openingId` combination was a
   contradiction.
4. **`openingIntervals` drops the spurious `wallLength` param.** Library
   signature: `openingIntervals(openings: readonly OpeningInput[])` →
   `WallOpeningInterval[]`, keeping `{ openingId, startDistance, endDistance,
   sillHeight, height, profile }` semantics. Embedding a resolved `ArchProfile`
   inside intervals is rejected (duplicates `buildArchProfile`; changes the
   compiler's data flow). Segment-id filtering becomes the caller's job.
5. **No root `vitest.config.ts` exists.** The config is
   `apps/museum/vitest.config.ts` (`include: ['tests/**/*.{test,spec}.{js,ts}']`,
   `$lib` alias, svelte plugin). Prefer a package-local config for the kernel
   (no `$lib`/svelte deps) over extending the app config's include glob.
6. **Step-1 shims must be two files named to match existing imports.**
   `layout-types.ts` (LayoutVec2, LayoutInteriorAnchor, DraftSegment,
   LayoutOpening) **and** `layout-geometry-types.ts` (CompiledArchProfile,
   CompiledWallSection) so `./layout-types` and `./layout-geometry-types`
   resolve with zero edits to the moved files. The single `types-shim.ts` was
   incomplete (missing the geometry-types) and misnamed (forced import edits).
7. **`sampleLineSegment` restores the line-path contract.** Signature
   `sampleLineSegment(start, end, maxSampleSpan, maxSamples?)` throwing
   `sampling_length_invalid` (non-finite input) and
   `sampling_budget_exceeded` (steps+1 > maxSamples), matching `lineParameters`.
   The 3-arg version lost the circuit breaker.

### 12.2 Verified consumer map (Step 1 rewiring target)

Direct importers of the two kernel files (verified 2026-08-15):

| Importer (verified path) | Kernel symbols used |
|---|---|
| `lib/layout/layout-geometry.ts` | `pointAlongSamples`, `SampledSegment`; `layout-geometry-openings` (compiler entry — `compileLayoutGeometry` lives here, not in a `layout-compiler.ts`) |
| `lib/layout/layout-geometry-validation.ts` | curve helpers; `buildArchProfile`, `openingIntervals`, `LAYOUT_GEOMETRY_EPSILON` |
| `lib/layout/wall-mesh-builder.ts` | `archProfileTopAt`, `LAYOUT_GEOMETRY_EPSILON`, `sampledPolylineSelfIntersects`, `CurveSample` |
| `lib/layout/layout-codec.ts` | `legacyBezierToAutoBezier` (persistence migration — stays versioned) |
| `lib/layout/layout-geometry-openings.ts` | the second kernel file (imports curve) |
| `lib/editor/layout/curve-geometry.ts` | curve kernel |
| `lib/editor/layout/layout-auto-bezier.ts` | curve kernel |
| `lib/editor/layout/draft-geometry.ts` | re-exports `sampleSegment` as `sampleWallSegment`; `CompiledWallSection` as `WallPreviewSection` |

Transitive type consumers (import via `layout-geometry.ts` / types):
`lib/layout/plan-render-model.ts`, `lib/layout/layout-portals.ts`,
`lib/render/wall-geometry-adapter.ts` (verified: does **not** import
`CompiledWallSection` directly), `lib/editor/layout/layout-mesh-factory.ts`
(consumes `CompiledWallSection`).

### 12.3 Corrected Step-2 ripple matrix

| Type change | Verified consumers | Action |
|---|---|---|
| `SampledSegment` → `SampledCurve` (drop `segmentId`) | `layout-geometry.ts`, `layout-geometry-validation.ts`, `draft-geometry.ts`, `curve-geometry.ts`, `layout-auto-bezier.ts` | Most callers use distance-ordered samples only; where correlation is needed, pass a key alongside (compiler maps) |
| `CompiledWallSection` (kept `bottomY`/`topY`/`profileBaseY`/`openingId`) | `layout/wall-mesh-builder.ts`, `layout-geometry.ts`, `editor/layout/layout-mesh-factory.ts`, `editor/layout/draft-geometry.ts` | **No code change** — rewire the import source only |
| `DraftSegment` → `sampleLineSegment` vs cubic path | `layout-geometry.ts`, `layout-geometry-validation.ts` | Route `kind === 'line'` → `sampleLineSegment`; else compile + sample cubics |
| `LayoutOpening` → `OpeningInput` (strip `connectsRoomIds`, `segmentId`; carry `key`) | `layout-geometry.ts`, `layout-geometry-validation.ts` | Strip before calling; pass id via `key` |
| `buildArchProfile` structured issues | `layout-geometry-validation.ts`, `editor/layout/arch-profile.ts` | No change (codes preserved) |

### 12.4 Corrected API declarations (disputed types only)

```ts
// /openings

export interface OpeningInput {
  readonly key?: string;        // caller-owned; museum passes the layout opening id
  readonly offset: number;      // arc-distance along the wall centerline
  readonly width: number;
  readonly sillHeight: number;
  readonly height: number;
  readonly profile: ArchKind;   // 'rectangular' | 'rounded' | 'pointed'
}

export interface WallOpeningInterval {
  readonly openingId?: string;  // derived from OpeningInput.key
  readonly startDistance: number;
  readonly endDistance: number;
  readonly sillHeight: number;
  readonly height: number;
  readonly profile: ArchKind;   // kind, not a resolved profile (rejected redesign)
}

export function openingIntervals(openings: readonly OpeningInput[]): WallOpeningInterval[];

export interface CompiledWallSection {
  readonly kind: 'side' | 'lintel';   // kept for renderer consumption
  readonly startDistance: number;
  readonly endDistance: number;
  readonly bottomY: number;           // NOT bottomZ
  readonly topY: number;
  readonly archProfile?: ArchProfile;
  readonly profileBaseY?: number;     // arch-cap base; read by mesh builders
  readonly openingId?: string;
}

// /curve — line path with the full error contract

export function sampleLineSegment(
  start: Vec2,
  end: Vec2,
  maxSampleSpan: number,
  maxSamples?: number
): SampledCurve;  // throws sampling_length_invalid | sampling_budget_exceeded
```

## 13. Positioning addendum — discovery review (2026-08-15)

A doc-only discovery/positioning review was assessed. Verdict recorded: the
extraction is technically sound (reviewer ratings: technical 8/10, reusability
7/10), but as an OSS package the pitch is weak (reason-to-install 5/10,
discoverability 3/10, potential with better positioning 7–8/10) because the
name/pitch targets “geometry kernel” while nobody searches that, and the hero
workflow is buried deep in the doc.

Decisions:

1. **Pitch direction — lead with the workflow, not the kernel.** Public
   identity (round-6 copy): “2D path geometry for TypeScript. Smooth paths,
   sample by distance, find closest points, and get tangents/normals. Zero
   dependencies.” Hero reads `samplePath(points)` →
   `pointAtDistance(path, d)` → `projectPointToPath(path, mouse)`, with a
   one-glance visual (curve, point, tangent/normal, radial distance). The
   differentiator is the coherent pipeline — stated in plain language up
   front; the math (centripetal Catmull-Rom, adaptive flatness, O(log n))
   moves to a “How it works” section below the fold (§16).
2. **Naming.** Candidate `@spatial-sketch/path-geometry` over
   `geometry-kernel` for any public surface; decide once, before publishing.
3. **`/openings` stays in the workspace but is de-emphasized in the public
   story.** The museum depends on it (walls, doors, windows, arches — the
   reviewer's own “most unusual code”), so it ships and keeps its golden
   tests; the entrypoint split (§3) means the README/hero simply leads with
   `/curve`. “Keep openings private” was interpreted as pitch emphasis, not
   removal.
4. **Internal contradiction resolved.** §8 no longer claims “TRUE arc-length”
   spacing or CNC constant-feed traversal; §5.3's chord-lower-bound honesty
   governs every pitch sentence. (A graphics audience will notice the
   inconsistency and trust the package less.)
5. **Publish philosophy reframed.** §11's “no npm publish until an external
   consumer exists” is goal-conditional: right when the goal is avoiding
   maintenance tax, self-defeating when the goal is OSS presence (an
   unpublished package cannot be discovered). If discovery is the goal:
   publish `0.1.0` with an explicit “API evolving — no stability promise”
   contract, then let external consumers report which parts are actually
   useful.
6. **Discovery mechanics.** v0.1 ships **one** interactive demo — closest-point
   projection following the mouse, showing tangent + normal — not a three-tab
   playground (release-scope decision, round 6: three tabs risks turning the
   extraction into another product project). Even-spacing and procedural-wall
   demos are deferred until the package shows interest. Museum editor is the
   provenance showcase (GIF: click wall → bend path → opening → 3D output),
   plus 2–3 problem-oriented posts that own the exact search queries: “place
   objects evenly along a Bézier in TypeScript”, “find the closest point on a
   Bézier path in TypeScript”, “get tangent and normal at distance along a
   curve in TypeScript”. Trying to win “best TypeScript Bézier library”
   head-on is a losing fight against `bezier-js`/`@flatten-js/core`; winning
   “easiest way to project a mouse onto a sampled 2D path” is realistic.

Nuance recorded: the reviewer's disagreement with the §11 “do not publish”
verdict is accepted only under the OSS-presence goal; the two goals (avoid
maintenance tax vs build presence) lead to different publication decisions,
and the choice is a product decision, not a technical one.

## 14. Appendix — README hero draft (per §13)

Reviewable draft of the README hero, ready to lift into the package README at
Step 1. The hero uses the friendly convenience surface (`samplePath`,
`projectPointToPath`) per §13; mapping to the §12.4 primitives is noted below
the fragment. Revised per the round-6 release-scope review: plain-language
tagline up front, demo immediately, math terminology moved to “How it works”.

````markdown
# @spatial-sketch/path-geometry

**2D path geometry for TypeScript. Smooth paths, sample by distance, find closest points, and get tangents/normals. Zero dependencies.**

```ts
import { samplePath, pointAtDistance, projectPointToPath } from '@spatial-sketch/path-geometry';

// Click points → a smooth path through them.
const path = samplePath([[0, 0], [2, 1], [6, 1], [8, 0]]);

// 8 stanchions at ~equal spacing along the path — no bunching on curves.
for (let d = 0; d < path.length; d += path.length / 8) {
  const { point, tangent, normal } = pointAtDistance(path, d);
  placeObject(point, tangent, normal);
}

// Snap a cursor to the path; get orientation and how far off-path you are.
const { point, tangent, normal, distanceToPath } = projectPointToPath(path, mouse);
```

**[Try it live]** — drag the path, watch the closest point and orientation follow your cursor. *(one demo, per §16)*

```
          ●
        ╱   ╲
───●────────●──────     sampled path

        ↑ closest point
      ● mouse ─────────
        │
  distanceToPath = 41 px
  tangent  = [0.97, 0.24]
  normal   = [-0.24, 0.97]
```

## What you can do

- **Draw smooth paths from click points** — no control handles to fight.
- **Sample by distance** — even spacing, dashes, markers, text along a path.
- **Find the closest point** — snapping and path following, with tangent +
  normal for orientation.
- **Check intersections** — including shared corners (adjacent walls don't
  false-positive).

Zero dependencies · TypeScript · ESM · Node 20+ / browsers.

## How it works

(For the curious — skip if you just want results.) Paths are built as
centripetal Catmull-Rom splines and sampled with adaptive flatness-based
subdivision. Distances are accumulated **chord** lengths — a lower bound on
true arc length (≤ ~0.4% error worst-case on tight curves, far less on gentle
ones); queries are O(log n) binary searches over the sample cache. If you need
*analytical* arc length or exact derivatives (CNC feed-rate planning,
animation velocities), this isn't that library — yet.

## Built from a real editor

This is the geometry engine powering an interactive floor-plan → 3D editor:
draw a plan, bend a wall path, punch a door or window, and extrude to 3D — the
same sampled distances, normals, and wall sections drive the 2D plan view and
the 3D runtime.

![Click wall → bend path → add opening → 3D output](assets/museum-editor.gif)

It's ~830 lines, zero dependencies, TypeScript-first, and pinned by golden
tests.
````

**Naming/API mapping (for the implementer):** the hero names `samplePath` and
`projectPointToPath` are the *friendly* convenience surface. `samplePath` =
`compileCentripetalSpline` + `sampleCubicSpline`/`sampleLineSegment` with
line-vs-curve routing (§12.3) collapsed into one call;`projectPointToPath` = §12.4's `projectPointToCurve`. To make the hero import literally true, the
§3/§12 exports map needs a root `.` entrypoint exporting the friendly surface,
with `/curve` (low-level primitives) and `/openings` (wall sections) as
subpaths — flag this as a small extension to the agreed exports map.

## 15. Appendix — post draft: “Place objects evenly along a Bézier curve in TypeScript”

First problem-oriented post per §13 item 6. It owns the search query “place
objects evenly along a Bézier curve in TypeScript”, teaches the problem (t vs
distance, chord-length honesty), shows a compact DIY implementation, then
funnels to the package with the museum provenance. Assumes the §13 publish
decision (0.1.0, API evolving). GIF and “next in series” links are placeholders
to fill at publish.

````markdown
# Place objects evenly along a Bézier curve in TypeScript

*You're not spacing along the curve. You're spacing along `t`. Those are
different things.*

You have a curved path — a wall, a road, a garden border — and you want to
place things along it at even intervals: fence pickets, street lights, dashes,
stitches, tour stops. This is the most common request I see for Bézier work,
and the naive answer is wrong in a way that's easy to miss.

## The naive approach, and why it bunches

```ts
const c: Cubic = [[0, 0], [1, 2], [5, 2], [6, 0]];

for (let t = 0; t <= 1; t += 0.05) {
  place(bez(c, t));   // 21 objects, but look at the spacing
}
```

Bézier curves don't move at constant speed. Near a control point the curve
covers a lot of `t` for a little distance; on a long flat span it does the
opposite. So `t += 0.05` puts objects far apart on the flats and mashed
together on the tight bends.

## What you actually want: distance along the curve

You want to ask “give me the point 3.7 meters along this path” —
*arc-length parameterization*. The catch: arc length of a cubic Bézier has no
closed form in elementary functions (it's an elliptic integral). You can
numerically integrate, but for real-world work there's a simpler, more robust
route.

**Sample the curve adaptively, accumulate chord lengths, then binary-search
the cache.** Three small pieces:

```ts
// 1. Subdivide until the curve is flat enough per chord.
//    sagitta() = distance from the midpoint back to the chord.
const sample = (c: Cubic, flat = 0.01, maxSpan = 0.25, depth = 12): Vec2[] => {
  const out: Vec2[] = [];
  const visit = (t0: number, t1: number, d: number): void => {
    const p0 = bez(c, t0), p1 = bez(c, t1), pm = bez(c, (t0 + t1) / 2);
    if (d < depth && (sagitta(pm, p0, p1) > flat || len(p0, p1) > maxSpan)) {
      visit(t0, (t0 + t1) / 2, d + 1);
      visit((t0 + t1) / 2, t1, d + 1);
    } else out.push(p0);
  };
  visit(0, 1, 0);
  return [...out, bez(c, 1)];
};

// 2. Accumulate chord lengths into a monotonic distance cache.
const dists = (pts: Vec2[]): number[] => {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1]! + len(pts[i - 1]!, pts[i]!));
  return d;
};

// 3. Binary search: the point at distance s along the curve (O(log n)).
const at = (pts: Vec2[], d: number[], s: number): Vec2 => {
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; d[mid]! < s ? (lo = mid + 1) : (hi = mid); }
  const i = Math.max(1, lo), span = d[i]! - d[i - 1]!;
  const a = span > 1e-9 ? (s - d[i - 1]!) / span : 0;
  return lerp(pts[i - 1]!, pts[i]!, a);
};

// 24 pickets, ~evenly spaced along the curve:
const pts = sample(c);
const ds = dists(pts);
for (let s = 0; s < ds.at(-1)!; s += ds.at(-1)! / 24) {
  place(at(pts, ds, s));
}
```

That's the whole trick. Sample until flat, accumulate distances, search by
distance.

## Be honest about the math

Those distances are **chord lengths**, not analytical arc length — a lower
bound on the true length. On a tightly curving path the deficit can reach
~0.4% of path length worst case; on gentle curves it's negligible. For placing
objects, that's fine. For CNC feed-rate planning or anything needing exact
derivatives, you need real arc length — different problem.

## Why I extracted this into a package

I built this into a floor-plan → 3D editor: click points, bend a wall path,
punch in a door, extrude to 3D. Production added a pile of edge cases the
snippet above doesn't have:

- smooth *centripetal splines* from raw click points, not just one cubic
- straight runs sampled differently from curves (uniform span, not flatness
  recursion)
- degenerate inputs — 1-point and 2-point paths
- sampling budgets, so a pathological input can't freeze the tab
- structured error codes, shared-endpoint intersection tolerance
- golden tests pinning every number

So I extracted the engine: **@spatial-sketch/path-geometry** — zero
dependencies, TypeScript, ~830 lines, the same code that runs the editor's 2D
plan view and 3D runtime.

![Click wall → bend path → add opening → 3D output](assets/museum-editor.gif)

```ts
import { samplePath, pointAtDistance } from '@spatial-sketch/path-geometry';

const path = samplePath(clickedPoints);            // points → smooth sampled path
for (let s = 0; s < path.length; s += path.length / 24) {
  const { point, tangent, normal } = pointAtDistance(path, s);
  placePicket(point, tangent, normal);             // even spacing + orientation
}
```

Next in this series: *find the closest point on a Bézier path in TypeScript* —
snapping a cursor to a curved wall — and *tangent and normal at distance along
a curve*. There's a live demo where you can drag the path and watch the
closest-point projection follow your cursor.
````

## 16. Release-scope addendum (round 6, 2026-08-15)

Reviewer direction adopted: **do not build all three playground tabs before
release** — that risks turning the library extraction into another product
project. v0.1 scope, in order:

1. Package stable enough (Step 1 + API cleanup per §12).
2. Strong README (hero per §14, revised).
3. One interactive demo: closest-point projection + tangent/normal.
4. Museum GIF as real-world proof.
5. Publish `0.1.0` (API evolving).
6. One article (post draft §15).
7. Measure what users care about; add even-spacing / procedural-wall demos
   only if the package shows interest.

Also adopted: hero copy is plain language first (“2D path geometry for
TypeScript. Smooth paths, sample by distance, find closest points, and get
tangents/normals. Zero dependencies.”); math terminology (centripetal
Catmull-Rom, adaptive flatness, O(log n)) moves to a “How it works” section
below the fold. §13 and §14 updated to match.

## 17. Extraction timing — roadmap gate state (2026-08-15)

**Finding (post-round-7): G1 is already shipped — it predates H1, so the
“wait for G1” trigger is already satisfied.** Verified from
`docs/plans/2026-08-13-graphics-architecture-roadmap.md` and
`docs/hand-off/CURRENT.md`.

### Gate state

- **Completed:** B5 (runtime cutover) → G1 (shared geometry compiler) → G2
  (Plan render boundary) → G3 (performance harness) → G4 (procedural meshes)
  → H1 S0–S5. Full suite 1420 green, `svelte-check` 0.
- **In flight:** H1 S6 (centralized 3D selection) next, then S7–S9+; C1 (Plan
  staging mode) is the locked post-H1 polish slice.
- **Deferred:** G5 (measured optimization) — no focused plan yet,
  non-blocking for H1; G6 (bounded WebGPU experiments) later.

### Implications for the extraction

1. **Step 2 is unblocked.** The compiler contract it targets
   (`compileLayoutGeometry(): CompiledLayoutGeometryResult` — sampled curves,
   arc-length tables, tangents/normals, wall sections, query records,
   qualified identities) is locked in shipping code, with the hard rule “no
   consumer may independently resample layout curves or reinterpret opening
   topology”. The API decoupling (§12) should target the settled contract,
   not a moving one.
2. **The §13 provenance story is fact, not aspiration.** Plan, editor 3D, and
   visitor 3D already consume the one compiled geometry — the marketing track
   (§14/§15/§16) blocks on nothing in the roadmap.
3. **Remaining timing considerations, in order:**
   a. **Working-tree WIP** (H1 S4/S5 staged + unstaged) is the only practical
      blocker for a clean extraction branch — branch from HEAD `5f2c575`
      (kernel files are clean there); land or stash the WIP first.
   b. **Kernel consumers are still actively modified by H1** — S5 landed
      `pickRanges` on `wall-mesh-builder.ts`, one of the 8 direct importers
      (§12.2). Extracting the kernel (curve + openings) isolates from that
      churn; the consumers evolve in the app either way.
   c. **Two G3 backlog quick-wins touch the kernel** and should be sequenced
      deliberately relative to Step 1/Step 2: **#5** binary-search
      `pointAlongSamples` and unify with `pointAtDistance` (quick-win);
      **#6** thread precomputed cubics into auto-bezier tangent eval
      (quick-win). If Step 2 lands first, they land inside the package.

**Verdict:** extraction timing is no longer gated on the roadmap. The only
real gates are WIP hygiene and the sequencing choice for quick-wins #5/#6.
