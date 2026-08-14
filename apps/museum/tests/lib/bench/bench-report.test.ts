import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { DEFAULT_NODE_OPTIONS, makeNodeProvenance, measureNodeTier } from '$lib/bench/plan-bench';
import { chopinWallMeshRenderPolicyFactory, measureBrowserTier } from '$lib/bench/browser-bench';
import { checkBudgets, validateBaseline } from '$lib/bench/bench-report';
import type { BudgetBaseline, BenchTierResult } from '$lib/bench/bench-types';
import baselineJson from '$lib/bench/baselines/g3-baseline.json';

const baseline = baselineJson as unknown as BudgetBaseline;

function measureChopin(): BenchTierResult {
	// Node and browser tiers share one warm-up/sample config so the single merged
	// provenance block truthfully describes every sample it carries.
	const provenance = makeNodeProvenance();
	const sharedOptions = { warmup: DEFAULT_NODE_OPTIONS.warmup, samples: DEFAULT_NODE_OPTIONS.samples };
	const node = measureNodeTier(chopinProject.layout, 'chopin', provenance);
	// The visitor tier mirrors the recorder: production presentation + bespoke
	// exclusion (6 rooms), so the budget check validates the same semantics the
	// baseline was recorded under.
	const browser = measureBrowserTier(chopinProject.layout, 'chopin', provenance, {
		...sharedOptions,
		policyFactory: chopinWallMeshRenderPolicyFactory()
	});
	return { tier: 'chopin', provenance, samples: [...node.samples, ...browser.samples] };
}

describe('bench-report budgets', () => {
	it('baseline declares every enforced and advisory budget with a recorded reason', () => {
		expect(validateBaseline(baseline)).toEqual([]);
	});

	it('passes the enforced golden-fixture budgets on a fresh node + browser measurement', () => {
		const check = checkBudgets(measureChopin(), baseline.budgets);
		expect(check.violations).toEqual([]);
		expect(check.pass).toBe(true);
	}, 30000);

	it('fails closed when an enforced metric sample is missing from the result', () => {
		const report: BenchTierResult = { tier: 'chopin', provenance: makeNodeProvenance(), samples: [] };
		const check = checkBudgets(report, baseline.budgets);
		expect(check.pass).toBe(false);
		expect(check.violations).toContain('svg-node-count: missing from result');
	});

	it('fails closed when an enforced metric has no recorded budget', () => {
		const report: BenchTierResult = {
			tier: 'chopin',
			provenance: makeNodeProvenance(),
			samples: [{ metric: 'svg-node-count', unit: 'count', value: 71 }]
		};
		const check = checkBudgets(report, {});
		expect(check.pass).toBe(false);
		expect(check.violations).toContain('svg-node-count: no budget recorded');
	});

	it('fails closed when a measured value exceeds its fail bound', () => {
		const report: BenchTierResult = {
			tier: 'chopin',
			provenance: makeNodeProvenance(),
			samples: [{ metric: 'svg-node-count', unit: 'count', value: 9999 }]
		};
		const check = checkBudgets(report, baseline.budgets);
		expect(check.pass).toBe(false);
		expect(check.violations.some((violation) => violation.includes('svg-node-count'))).toBe(true);
	});
});
