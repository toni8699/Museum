import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { measureNodeTier, makeNodeProvenance } from './plan-bench';
import { checkBudgets, validateBaseline } from './bench-report';
import type { BudgetBaseline, BenchTierResult } from './bench-types';
import baselineJson from './baselines/g3-baseline.json';

const baseline = baselineJson as unknown as BudgetBaseline;

describe('bench-report budgets', () => {
	it('baseline declares every required budget with a recorded reason', () => {
		expect(validateBaseline(baseline)).toEqual([]);
	});

	it('passes the Chopin-tier budgets on a fresh measurement', () => {
		const report = measureNodeTier(chopinProject.layout, 'chopin', makeNodeProvenance());
		const check = checkBudgets(report, baseline.budgets);
		expect(check.violations).toEqual([]);
		expect(check.pass).toBe(true);
	}, 30000);

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
