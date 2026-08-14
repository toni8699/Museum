import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { DEFAULT_NODE_OPTIONS, makeNodeProvenance, measureNodeTier } from './plan-bench';
import { measureBrowserTier } from './browser-bench';
import { checkBudgets, validateBaseline } from './bench-report';
import type { BudgetBaseline, BenchTierResult } from './bench-types';
import baselineJson from './baselines/g3-baseline.json';

const baseline = baselineJson as unknown as BudgetBaseline;

function measureChopin(): BenchTierResult {
	// Node and browser tiers share one warm-up/sample config so the single merged
	// provenance block truthfully describes every sample it carries.
	const provenance = makeNodeProvenance();
	const sharedOptions = { warmup: DEFAULT_NODE_OPTIONS.warmup, samples: DEFAULT_NODE_OPTIONS.samples };
	const node = measureNodeTier(chopinProject.layout, 'chopin', provenance);
	const browser = measureBrowserTier(chopinProject.layout, 'chopin', provenance, sharedOptions);
	return { tier: 'chopin', provenance, samples: [...node.samples, ...browser.samples] };
}

describe('bench-report budgets', () => {
	it('baseline declares every enforced budget with a recorded reason', () => {
		expect(validateBaseline(baseline)).toEqual([]);
	});

	it('passes the Chopin budgets on a fresh node + browser measurement', () => {
		const check = checkBudgets(measureChopin(), baseline.budgets);
		expect(check.violations).toEqual([]);
		expect(check.pass).toBe(true);
	}, 30000);

	it('fails closed when an enforced metric sample is missing from the result', () => {
		const report: BenchTierResult = { tier: 'chopin', provenance: makeNodeProvenance(), samples: [] };
		const check = checkBudgets(report, baseline.budgets);
		expect(check.pass).toBe(false);
		expect(check.violations).toContain('hit-test: missing from result');
	});

	it('fails closed when an enforced metric has no recorded budget', () => {
		const report: BenchTierResult = {
			tier: 'chopin',
			provenance: makeNodeProvenance(),
			samples: [{ metric: 'hit-test', unit: 'ms', value: 0.1 }]
		};
		const check = checkBudgets(report, {});
		expect(check.pass).toBe(false);
		expect(check.violations).toContain('hit-test: no budget recorded');
	});

	it('fails closed when a measured value exceeds its fail bound', () => {
		const report: BenchTierResult = {
			tier: 'chopin',
			provenance: makeNodeProvenance(),
			samples: [
				{ metric: 'layout-compile', unit: 'ms', value: 9999 },
				{ metric: 'hit-test', unit: 'ms', value: 0.1 }
			]
		};
		const check = checkBudgets(report, baseline.budgets);
		expect(check.pass).toBe(false);
		expect(check.violations.some((violation) => violation.includes('layout-compile'))).toBe(true);
	});
});
