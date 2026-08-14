/**
 * Versioned benchmark report contract for the G3 performance harness.
 * Reports are serialized JSON with a provenance block; every metric has a
 * unit and (for time metrics) p50/p95 aggregates.
 */

export const BENCH_METHOD_VERSION = 2;

export type BenchMetricName =
	| 'layout-compile'
	| 'plan-render-build'
	| 'plan-render-initial'
	| 'plan-render-work-pan-zoom'
	| 'plan-render-work-edit'
	| 'hit-test'
	| 'snap-query'
	| 'svg-node-count'
	| 'three-object-estimate'
	| 'three-material-estimate'
	| 'three-draw-call-estimate'
	| 'three-triangle-estimate'
	| 'gpu-frame'
	| 'memory-heap'
	| 'three-regen'
	| 'compiled-memory'
	| 'cache-key-code-units';

export type BenchUnit = 'ms' | 'count' | 'bytes' | 'nodes';

export type BenchTier = 'chopin' | 'small' | 'medium' | 'large';

export type BenchProvenance = {
	commitSha: string;
	date: string;
	browser?: { name: string; version: string };
	deviceProfile: string;
	warmup: number;
	samples: number;
	methodVersion: number;
};

export type BenchSample = {
	metric: BenchMetricName;
	unit: BenchUnit;
	/** Representative value: p50 for time metrics, exact count/size otherwise. */
	value: number;
	p50?: number;
	p95?: number;
};

export type BenchTierResult = {
	tier: BenchTier;
	seed?: number;
	roomCount?: number;
	provenance: BenchProvenance;
	samples: BenchSample[];
};

export type Budget = {
	/** Budget that must hold at the supported product scale. */
	target: number;
	/** Hard regression bound: exceeding this fails the budget check. */
	fail: number;
	/** Recorded product/measurement reason for this budget. */
	reason: string;
};

export type BudgetBaseline = {
	methodVersion: number;
	/** Budgets apply to the `chopin` (supported product) tier only. */
	budgets: Partial<Record<BenchMetricName, Budget>>;
	/** Comparison tiers; recorded, never enforced. */
	tiers: BenchTierResult[];
};

/**
 * Metrics the Chopin budget check enforces. Every metric here must be present in
 * the measured result, budgeted in the baseline, and under its `fail` bound —
 * otherwise the check fails closed. The SVG node count, chord-box topology
 * estimates, and cache-key footprint are deterministic and included so
 * SVG/Three/cacheKey regressions cannot slip past CI; frame-time metrics stay
 * advisory (environment-dependent) and are not enforced.
 */
export const ENFORCED_BUDGET_METRICS: readonly BenchMetricName[] = [
	'layout-compile',
	'plan-render-build',
	'hit-test',
	'snap-query',
	'compiled-memory',
	'cache-key-code-units',
	'svg-node-count',
	'three-object-estimate',
	'three-material-estimate',
	'three-draw-call-estimate',
	'three-triangle-estimate'
];
