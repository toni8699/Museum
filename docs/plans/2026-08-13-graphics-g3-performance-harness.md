# G3 — Graphics Performance Harness

**Date:** 2026-08-13
**Status:** Proposed
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)
**Prerequisite:** [`2026-08-13-graphics-g2-plan-render-model.md`](./2026-08-13-graphics-g2-plan-render-model.md)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Make performance measurable, reproducible, and gated **before** any optimization
or renderer change. G3 delivers three things and nothing else:

1. **Deterministic generated layouts** at 10, 100, and 1,000 rooms with a fixed
   mix of lines/curves, openings/profiles, and objects, so results stay
   comparable across runs, commits, and devices.
2. **A measurement harness** that captures the roadmap's metric list against
   those fixtures, with pinned environment, warm-up, sample counts, and a
   documented method per metric.
3. **Checked-in baselines plus target/fail budgets** for the currently supported
   product scale. The 10/100/1,000-room results are comparison tiers, not a
   claim that every tier must be interactive.

G3 measures and sets budgets. It does **not** optimize: caching, partial
rebuilds, spatial indexes, batching, culling, and LOD remain G5. It exists so
that G4/G5 and G6 each start from a recorded baseline and every optimization
slice is traceable to a measured product problem. A budget change requires a
recorded product or measurement reason — never a quieter regression.

G1 gave one shared `compileLayoutGeometry()` and G2 gave one explicit
`PlanRenderModel`. G3 is the third leg of the foundation: now that the cost
centers are named (`compileLayoutGeometry`, `buildPlanRenderModel`,
`resolvePlanHit`, the SVG adapter, the Three adapters), the harness can time
them individually instead of one opaque "the editor is slow."

## Current gaps

| Concern | Today | G3 outcome |
|---------|-------|------------|
| Scale fixtures | Hand-authored G1/G2 parity fixtures (~8 layouts) and the 9-room Chopin project | One seeded generator emitting valid 10/100/1,000-room `LayoutDocument`s with a fixed mix |
| Compile/model/hit timing | No timers; correctness tests only | Pure Node-tier metrics: `compileLayoutGeometry`, `buildPlanRenderModel`, `resolvePlanHit`, snapping-query, and cache-key allocation |
| Frame-level timing | None | Browser-tier p50/p95 for initial Plan render, pan/zoom, and drag/edit under a pinned rAF loop |
| Renderer resource counts | None | SVG node count; Three object/material/draw-call/triangle/memory counts via `renderer.info` |
| Budgets | The roadmap names target/fail budgets as a requirement but none exist | Checked-in `target`/`fail` budgets for Chopin scale + a fail-closed CI comparison |
| Optimizations | The backlog lists 11 measured costs, several `G3`-homed, none validated | Each backlog item gets a metric that would justify it (G5 implements; G3 supplies the evidence) |

The roadmap's "Known optimization backlog" already assigns several items to G3
as their evidence home: #1 incremental per-room recompile, #2 merge
validate+compile, #3 drop `cloneJson` per edit, #4 spatial index for
self-intersection/picking, and #10 lazy/cheaper `cacheKey`. G3 must instrument
the metrics that would decide each of those — it does not implement them.

## Locked decisions

- The fixture generator is **pure, seeded, and deterministic**. A fixed seed
  plus a deterministic PRNG produces byte-identical `LayoutDocument` JSON across
  runs. Fixtures live under `$lib/layout/__fixtures__/` and import nothing from
  the editor, DOM, Svelte, Three, or the browser.
- The mix is fixed per scale so tiers remain comparable. Concretely (exact
  ratios are tunable but must be pinned in the fixture module): a target fraction
  of auto-Bezier vs line rooms; a fixed openings-per-wall density with a fixed
  rectangular/rounded/pointed profile distribution; and a fixed
  objects-per-room ratio across `box | plane | cylinder | sphere` with a small
  `profile` read-only slice. No scale may silently change the mix.
- Every generated document must pass `validateLayoutDocument` (the one strict
  codec below `$lib/layout`) and compile with zero blocking geometry issues. A
  generator that emits invalid layouts is a fixture bug, not a stress case; keep
  the existing invalid-geometry fixtures separate.
- Room topology is generated as a seeded grid-plus-jitter subdivision or an
  equivalent bounded procedure, not a hairball of random overlapping walls.
  Determinism matters more than realism; self-intersection is avoided by
  construction so the O(n²) all-pairs check stays a pure cost signal rather than
  a failure storm.
- **Two measurement tiers, one report.**
  - **Node tier** (deterministic, environment-light): compile time,
    model-build time, hit-test/snapping-query latency, cache-key allocation, and
    compiled-data memory footprint. Runs under vitest/Node with the same
    fixtures.
  - **Browser tier** (environment-pinned): initial Plan render time, pan/zoom
    and drag/edit p50/p95 frame times, SVG node count, Three
    object/material/draw-call/triangle counts, GPU frame time where exposed,
    and heap memory. Runs on a dev-only harness page against a pinned Chromium
    via agent-browser, or a documented manual protocol.
- The harness records provenance for every report: fixture seed, scale, browser
  version, device profile, warm-up count, sample count, measurement-method
  version, date, and commit SHA. Reports without provenance are not baselines.
- **Budgets are set only for the currently supported product scale** — the
  canonical Chopin project (~9 rooms) plus a small documented headroom. The
  10/100/1,000-room tiers are recorded comparison data; they never fail CI by
  themselves. A tier may be non-interactive and that is a documented result, not
  a broken build.
- Budget enforcement is **fail-closed but narrow**: CI compares the Node tier
  and the deterministic browser counts (SVG node count, draw calls, triangles,
  object/material counts) against the checked-in baselines. Frame-time budgets
  are advisory unless a documented stable runner makes them reliable; a budget
  change requires a recorded reason in the baseline JSON, never a silent
  threshold edit.
- The harness is **dev-only** and never shipped to visitors. The harness route
  joins the other `/dev/*` routes, stays absent from the production visitor
  import graph, and adds no measurement code to `LayoutMuseumShell`,
  `LayoutPlanViewport.svelte`, or `PlanSvg.svelte`'s production path (only
  instrumented adapters/wrappers used by the harness page).
- Measurement must not perturb what it measures where avoidable: Node tier uses
  a warm-up pass and repeated samples with median/percentile aggregation; the
  browser tier uses a warm-up and multiple rAF windows with dropped first
  frames. Results are recorded in a versioned JSON schema, never CSV ad hoc.
- No optimization ships in G3. If a measured number is already inside budget at
  supported scale, the harness's job is to say so, not to "improve" it.

## Public contract

The exact file split may vary, but the public contract must express these
relationships:

```ts
// fixture generator (pure, deterministic)
type ScaleFixtureSpec = {
  seed: number;
  roomCount: number;
  bezierFraction: number;      // of rooms that use auto-bezier
  openingsPerWall: number;
  profileMix: { rectangular: number; rounded: number; pointed: number };
  objectsPerRoom: number;
  objectKindMix: { box: number; plane: number; cylinder: number; sphere: number; profile: number };
};

buildScaleFixture(spec: ScaleFixtureSpec): LayoutDocument;
SCALE_FIXTURE_SEEDS: Record<'small' | 'medium' | 'large', ScaleFixtureSpec>; // 10 / 100 / 1_000

// measurement report (versioned JSON)
type BenchProvenance = {
  commitSha: string;
  date: string;
  browser?: { name: string; version: string };
  deviceProfile: string;
  warmup: number;
  samples: number;
  methodVersion: number;
};

type BenchSample = {
  metric: BenchMetricName;
  unit: 'ms' | 'px' | 'count' | 'bytes' | 'nodes';
  value: number;
  p50?: number;
  p95?: number;
};

type BenchTierResult = {
  tier: 'chopin' | 'small' | 'medium' | 'large';
  provenance: BenchProvenance;
  samples: BenchSample[];
};

type Budget = { target: number; fail: number; reason: string };
type BudgetBaseline = { budgets: Record<BenchMetricName, Budget>; tiers: BenchTierResult[] };

// harness entry points
measureNodeTier(fixture: LayoutDocument, spec: ScaleFixtureSpec): BenchTierResult;
measureBrowserTier(fixture: LayoutDocument): Promise<BenchTierResult>;
checkBudgets(result: BenchTierResult, baseline: BudgetBaseline): { pass: boolean; violations: string[] };
```

`BenchMetricName` covers at least the roadmap list:

- `layout-compile` (ms) — `compileLayoutGeometry()` wall time per document;
- `plan-render-build` (ms) — `buildPlanRenderModel()` wall time per document;
- `plan-render-initial` (ms) — first paint of the Plan model through the SVG adapter;
- `plan-pan-zoom-frame` (ms) — p50/p95 rAF frame time during scripted pan/zoom;
- `plan-edit-frame` (ms) — p50/p95 rAF frame time during scripted drag/edit;
- `hit-test` (ms) — `resolvePlanHit()` plus the placement containment query;
- `snap-query` (ms) — candidate snapping-query latency;
- `svg-node-count` (nodes) — SVG element count in the Plan pane;
- `three-object-count` / `three-material-count` (count);
- `three-draw-calls` / `three-triangles` (count) — from `renderer.info.render`;
- `gpu-frame` (ms) — where the browser exposes it;
- `memory-heap` (bytes) — heap/`performance.memory` where available;
- `three-regen` (ms) — 3D regeneration time after a committed edit;
- `compiled-memory` (bytes) — Node-tier compiled-data footprint;
- `cache-key-cost` (ms) — time spent producing `cacheKey`s (backlog #10 signal).

The browser tier scripts the same user actions against every fixture
(initial open → fit → N pan/zoom gestures → one room drag/edit → recompile →
recount) so frame samples are comparable, not "whatever the human did."

## Implementation sequence

### 1. Freeze the fixture generator

1. Add `layout-scale-fixtures.ts` with the seeded deterministic generator and
   the pinned `SCALE_FIXTURE_SEEDS` mix for 10/100/1,000 rooms.
2. Prove determinism: two runs with the same seed produce deep-equal JSON; two
   seeds differ; the spec mix is reflected in the output counts.
3. Prove validity: every generated document passes `validateLayoutDocument` and
   `compileLayoutGeometry()` with zero blocking issues, at all three scales.
4. Add the canonical Chopin project as the `chopin` tier (already a checked-in
   fixture — reference it, do not regenerate it).

### 2. Build the measurement core

1. Add `bench-harness.ts`: warm-up + sampled runs, median/p50/p95 aggregation,
   provenance stamping, and versioned report serialization.
2. Keep it browser-agnostic (usable from vitest and the browser page) and free
   of Svelte/Three imports.

### 3. Instrument the Node tier

1. Add `plan-bench.ts` measuring `layout-compile`, `plan-render-build`,
   `hit-test`, `snap-query`, `compiled-memory`, and `cache-key-cost` against the
   generated fixtures, with a warm-up and repeated samples.
2. Expose it as a focused vitest bench/measurement test so CI can run it
   deterministically; record per-tier results.

### 4. Instrument the browser tier

1. Add a dev-only `/dev/perf` harness page (alongside `/dev/assets`,
   `/dev/materials`) that loads each fixture into the real Plan viewport and 3D
   scene without touching the production visitor path.
2. Add `browser-bench.ts`: the scripted rAF frame sampler (initial render,
   pan/zoom, edit), SVG node counter, Three `renderer.info` reader
   (object/material/draw-call/triangle counts), GPU-frame and memory readers
   where exposed, and `three-regen` timing after a committed edit.
3. Drive it under a pinned Chromium via agent-browser for the browser samples;
   document a manual protocol as fallback.

### 5. Set budgets and check in baselines

1. Run both tiers at Chopin scale to establish current numbers; set `target`
   (current + small headroom) and `fail` (a documented regression bound) budgets
   with a written reason per metric.
2. Record 10/100/1,000-room tier results as comparison data with no pass/fail
   enforcement.
3. Check in the baseline JSON plus the fixture seeds and method-version
   provenance.

### 6. Wire budget enforcement

1. Add `checkBudgets()` and a CI comparison for the deterministic metrics:
   Node tier plus the deterministic browser counts (SVG node count, draw calls,
   triangles, object/material counts).
2. Fail closed only on a documented `fail`-budget breach, and require a recorded
   reason for any budget edit. Mark frame-time budgets advisory until a stable
   runner justifies enforcing them.

### 7. Map the backlog to metrics

1. For each roadmap backlog item (#1/#2/#3/#4/#10), document which G3 metric is
   the deciding signal and where it must move to justify the optimization.
2. Do not implement any optimization; record the decision criteria in the plan
   or the baseline provenance so G5 starts with evidence, not guesses.

### 8. Close the slice

1. Run the Node-tier measurement, the full museum suite, Svelte check, and the
   production build; confirm no harness code enters visitor chunks.
2. Produce one reviewed baseline report with provenance for Chopin + 10/100/1,000.
3. Update `architecture.md`/`persistence.md` only if a contract changed; mark G3
   implemented in the roadmap/handoff; name G4 as the next slice.

## Parity and regression matrix

| Fixture / tier | Required assertions |
|----------------|---------------------|
| Determinism | Same seed → deep-equal `LayoutDocument` JSON; different seeds differ; counts reflect the pinned mix |
| Validity | `validateLayoutDocument` clean and `compileLayoutGeometry()` zero-blocking at 10/100/1,000 |
| Chopin | Compiles and renders through the same path as production; is the only budget-bearing tier |
| Node tier | `layout-compile`/`plan-render-build`/`hit-test`/`snap-query`/`cache-key-cost` all measured with warm-up + samples, p50/p95 reported |
| Browser tier | Initial render, pan/zoom and edit frame times, SVG node count, Three counts, GPU/memory where available, `three-regen` all captured under one scripted protocol |
| Budgets | `target`/`fail` exist for every Chopin metric with a recorded reason; `checkBudgets` fails on `fail` breach and passes otherwise |
| Provenance | Every report carries seed, browser/device, warm-up, samples, method version, date, commit SHA |
| Boundary | Harness and fixtures import no editor/Svelte/Three/DOM in the Node tier; `/dev/perf` is dev-only and absent from visitor chunks; production Plan/3D/shell paths carry no measurement code |

## Expected files

New, conceptually:

```text
apps/museum/src/lib/layout/__fixtures__/layout-scale-fixtures.ts
apps/museum/src/lib/layout/__fixtures__/layout-scale-fixtures.test.ts
apps/museum/src/lib/bench/bench-harness.ts
apps/museum/src/lib/bench/bench-types.ts
apps/museum/src/lib/bench/plan-bench.ts
apps/museum/src/lib/bench/bench-report.ts          (serialize + checkBudgets)
apps/museum/src/lib/bench/browser-bench.ts
apps/museum/src/lib/bench/three-stats.ts
apps/museum/src/routes/dev/perf/+page.svelte
apps/museum/src/lib/bench/baselines/*.json         (or docs/bench/*.json)
```

Primary edits:

```text
apps/museum/vitest.config.ts          (only if a bench project/profile is needed)
docs/plans/2026-08-13-graphics-architecture-roadmap.md  (mark G3 close)
```

Exact helper filenames may be consolidated if the fixture determinism, Node-tier
purity, and dev-only browser boundary stay clear. No production renderer,
viewport, shell, or compiler file gains measurement instrumentation.

## Verification

Automated:

```text
npm test -w @portfolio/museum -- <focused G3 fixture/bench test files>
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Node-tier measurement:

```text
npm test -w @portfolio/museum -- <plan-bench measurement>   # prints per-tier report
```

Browser-tier measurement:

```text
npx agent-browser --session g3-perf open http://localhost:5173/dev/perf
# follow the page's scripted run; capture the serialized report JSON
```

Manual QA:

- The fixture generator is byte-deterministic and its 10/100/1,000-room
  documents open in the editor Plan without blocking issues.
- The `/dev/perf` page runs the scripted protocol end-to-end and emits a
  provenance-complete report; production `/museum` and the editor are unchanged.
- Budget CI fails when a `fail` threshold is breached and passes otherwise; a
  budget edit without a recorded reason is rejected by review.

## Exit criteria

G3 is complete only when:

- a seeded deterministic generator emits valid 10/100/1,000-room layouts with a
  fixed, pinned mix and proven validity/determinism;
- the harness captures the full roadmap metric list with warm-up, samples, and
  p50/p95 aggregation, split into a pure Node tier and a dev-only browser tier;
- every report carries seed, browser/device, warm-up, sample, method-version,
  date, and commit provenance;
- checked-in baselines plus `target`/`fail` budgets exist for the Chopin product
  scale, with 10/100/1,000 recorded as comparison tiers only;
- budget enforcement fails closed on documented `fail` breaches and requires a
  recorded reason for budget changes;
- no measurement code or fixture generator enters the visitor import graph or
  production render/shell paths; and
- the full test suite, Svelte check, production build, and one reviewed baseline
  report pass.

## Explicit non-goals

- any optimization: caching, partial rebuilds, spatial indexes, batching,
  culling, LOD, instancing, or lazy `cacheKey` (G5, with G3 providing evidence);
- procedural `BufferGeometry`, wall joins/reveals/UVs, or chord-box replacement
  (G4);
- WebGPU/WGSL Plan backends, Rust/WASM, or alternate renderers (G6);
- changing `CompiledLayoutGeometry`, `PlanRenderModel`, or `LayoutDocument`;
- a claim that 1,000 rooms must be interactive; the tiers are comparison data;
- serializing any measurement into `MuseumProject`; and
- shipping any harness or `/dev/perf` route to production visitors.
