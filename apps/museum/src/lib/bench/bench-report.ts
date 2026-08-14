import {
	BENCH_METHOD_VERSION,
	ENFORCED_BUDGET_METRICS,
	type BenchMetricName,
	type BenchSample,
	type BenchTierResult,
	type Budget,
	type BudgetBaseline
} from './bench-types';

export type BudgetCheck = {
	pass: boolean;
	violations: string[];
	/** Metrics that ran but have no recorded budget. */
	unbudgeted: BenchMetricName[];
};

/**
 * Fail-closed comparison of a measured tier against recorded budgets.
 *
 * Every enforced metric must be (a) present in the measured result, (b)
 * budgeted in the baseline, and (c) under its `fail` bound — a missing sample,
 * missing budget, or over-fail value each produce a violation. Only the `fail`
 * bound is enforced (budget changes require a recorded reason); `target` is
 * advisory. Non-enforced metrics without a budget are reported, not failed.
 */
export function checkBudgets(
	result: BenchTierResult,
	budgets: Partial<Record<BenchMetricName, Budget>>,
	enforced: readonly BenchMetricName[] = ENFORCED_BUDGET_METRICS
): BudgetCheck {
	const violations: string[] = [];
	const unbudgeted: BenchMetricName[] = [];
	const measured = sampleByMetric(result.samples);

	for (const metric of enforced) {
		const sample = measured.get(metric);
		if (!sample) {
			violations.push(`${metric}: missing from result`);
			continue;
		}
		const budget = budgets[metric];
		if (!budget) {
			violations.push(`${metric}: no budget recorded`);
			continue;
		}
		if (sample.value > budget.fail) {
			violations.push(`${metric}: measured ${round(sample.value)} > fail ${budget.fail} (target ${budget.target})`);
		}
	}

	for (const sample of result.samples) {
		if (enforced.includes(sample.metric)) continue;
		if (!budgets[sample.metric]) unbudgeted.push(sample.metric);
	}

	return { pass: violations.length === 0, violations, unbudgeted };
}

/** Assert a baseline declares every required budget with a recorded reason. */
export function validateBaseline(baseline: BudgetBaseline): string[] {
	const problems: string[] = [];
	if (baseline.methodVersion !== BENCH_METHOD_VERSION) {
		problems.push(`methodVersion ${baseline.methodVersion} != ${BENCH_METHOD_VERSION}`);
	}
	for (const metric of ENFORCED_BUDGET_METRICS) {
		const budget = baseline.budgets[metric];
		if (!budget) problems.push(`missing budget for ${metric}`);
		else if (!budget.reason || budget.reason.trim().length === 0) problems.push(`missing reason for ${metric}`);
		else if (!(budget.fail >= budget.target)) problems.push(`fail (${budget.fail}) < target (${budget.target}) for ${metric}`);
	}
	return problems;
}

export function sampleByMetric(samples: readonly BenchSample[]): Map<BenchMetricName, BenchSample> {
	return new Map(samples.map((sample) => [sample.metric, sample]));
}

export function serializeBaseline(baseline: BudgetBaseline): string {
	return JSON.stringify(baseline, null, 2) + '\n';
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
