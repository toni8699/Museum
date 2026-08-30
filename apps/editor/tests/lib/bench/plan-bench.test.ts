import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../layout/__fixtures__/layout-scale-fixtures';
import { measureNodeTier, makeNodeProvenance, type NodeTierOptions } from '$lib/bench/plan-bench';
import type { BenchTier, BenchTierResult } from '$lib/bench/bench-types';

const LARGE_OPTIONS: NodeTierOptions = { warmup: 1, samples: 3, hitPoints: 40, tolerance: 0.2 };

// Full 4-tier measurement is opt-in (BENCH_FULL=1) so the default suite stays
// fast; the Chopin budget check in `bench-report.test.ts` runs on every CI pass.
const runFullBench = process.env.BENCH_FULL === '1';

describe.skipIf(!runFullBench)('plan-bench (Node tier, full)', () => {
	it('measures every deterministic tier and reports finite positive samples', () => {
		const provenance = makeNodeProvenance();
		const tiers: { tier: BenchTier; fixture: ReturnType<typeof buildScaleFixture> | typeof chopinProject.layout; options?: NodeTierOptions; seed?: number }[] = [
			{ tier: 'chopin', fixture: chopinProject.layout },
			{ tier: 'small', fixture: buildScaleFixture(SCALE_FIXTURE_SEEDS.small), seed: SCALE_FIXTURE_SEEDS.small.seed },
			{ tier: 'medium', fixture: buildScaleFixture(SCALE_FIXTURE_SEEDS.medium), seed: SCALE_FIXTURE_SEEDS.medium.seed },
			{ tier: 'large', fixture: buildScaleFixture(SCALE_FIXTURE_SEEDS.large), options: LARGE_OPTIONS, seed: SCALE_FIXTURE_SEEDS.large.seed }
		];

		const reports: BenchTierResult[] = [];
		for (const { tier, fixture, options, seed } of tiers) {
			const report = measureNodeTier(fixture, tier, provenance, options, seed);
			reports.push(report);
			for (const sample of report.samples) {
				expect(Number.isFinite(sample.value), `${tier}/${sample.metric} finite`).toBe(true);
				expect(sample.value >= 0, `${tier}/${sample.metric} non-negative`).toBe(true);
			}
		}

		// Determinism: the small tier measured twice yields identical counts and
		// near-identical timings (timings are excluded from the deep-equality
		// check since wall-clock is not deterministic).
		const smallAgain = measureNodeTier(buildScaleFixture(SCALE_FIXTURE_SEEDS.small), 'small', provenance, undefined, SCALE_FIXTURE_SEEDS.small.seed);
		expect(smallAgain.roomCount).toBe(reports[1]!.roomCount);
		expect(smallAgain.seed).toBe(SCALE_FIXTURE_SEEDS.small.seed);

		// Print a compact table for the baseline author to transcribe.
		// eslint-disable-next-line no-console
		console.log('\n=== G3 Node-tier report ===');
		for (const report of reports) {
			// eslint-disable-next-line no-console
			console.log(`\n[tier=${report.tier} rooms=${report.roomCount}]`);
			for (const sample of report.samples) {
				const p = sample.p50 === undefined || sample.p95 === undefined ? '' : ` p50=${fmt(sample.p50)} p95=${fmt(sample.p95)}`;
				// eslint-disable-next-line no-console
				console.log(`  ${sample.metric.padEnd(20)} ${fmt(sample.value)}${sample.unit}${p}`);
			}
		}
	}, 300000);
});

function fmt(value: number): string {
	if (value >= 100) return value.toFixed(1);
	if (value >= 1) return value.toFixed(2);
	return value.toExponential(2);
}
