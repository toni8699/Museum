/**
 * Versioned benchmark report contract for the G3 performance harness.
 * Reports are serialized JSON with a provenance block; every metric has a
 * unit and (for time metrics) p50/p95 aggregates.
 */

export const BENCH_METHOD_VERSION = 1;

export type BenchMetricName =
	| 'layout-compile'
	| 'plan-render-build'
	| 'plan-render-initial'
	| 'plan-pan-zoom-frame'
	| 'plan-edit-frame'
	| 'hit-test'
	| 'snap-query'
	| 'svg-node-count'
	| 'three-object-count'
	| 'three-material-count'
	| 'three-draw-calls'
	| 'three-triangles'
	| 'gpu-frame'
	| 'memory-heap'
	| 'three-regen'
	| 'compiled-memory'
	| 'cache-key-cost';

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

/** Metrics that must exist as budgets for the supported product scale. */
export const REQUIRED_BUDGET_METRICS: readonly BenchMetricName[] = [
	'layout-compile',
	'plan-render-build',
	'hit-test',
	'snap-query',
	'compiled-memory'
];
