/**
 * Versioned benchmark report contract for the G3 performance harness.
 * Reports are serialized JSON with a provenance block; every metric has a
 * unit and (for time metrics) p50/p95 aggregates.
 */

export const BENCH_METHOD_VERSION = 3;

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
	| 'compiled-memory'
	| 'cache-key-code-units'
	| 'wall-mesh-build';

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
	/** True when the working tree was dirty at record time (baseline not reproducible from HEAD alone). */
	treeDirty?: boolean;
	/** Deterministic content hash of the relevant sources, so a dirty-tree baseline stays reproducible. */
	contentHash?: string;
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
	/** Budget that must hold at the golden-fixture scale. */
	target: number;
	/** Hard regression bound: exceeding this fails the budget check (when enforced). */
	fail: number;
	/** Recorded measurement reason for this budget. */
	reason: string;
};

export type BudgetBaseline = {
	methodVersion: number;
	/** Budgets apply to the `chopin` frozen golden-fixture tier only. */
	budgets: Partial<Record<BenchMetricName, Budget>>;
	/** Comparison tiers; recorded, never enforced. */
	tiers: BenchTierResult[];
};

/**
 * Metrics the budget check enforces against the frozen Chopin golden fixture.
 * Every metric here must be present in the measured result, budgeted in the
 * baseline, and under its `fail` bound — otherwise the check fails closed.
 * These are all deterministic (exact counts/sizes), so they assert that the
 * compile/mesh pipeline produces the same output for the same input rather
 * than measuring wall-clock speed.
 */
export const ENFORCED_BUDGET_METRICS: readonly BenchMetricName[] = [
	'compiled-memory',
	'cache-key-code-units',
	'svg-node-count',
	'three-object-estimate',
	'three-material-estimate',
	'three-draw-call-estimate',
	'three-triangle-estimate'
];

/**
 * Wall-clock timing metrics. Recorded and budgeted for reference but not
 * enforced: they depend on machine load, and the product scale is now
 * greenfield H1 projects rather than Chopin. Re-enable once a representative
 * H1 fixture and stable CI hardware exist.
 */
export const ADVISORY_BUDGET_METRICS: readonly BenchMetricName[] = [
	'layout-compile',
	'plan-render-build',
	'wall-mesh-build',
	'hit-test',
	'snap-query'
];
