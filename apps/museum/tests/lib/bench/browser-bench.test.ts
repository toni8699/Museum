import { describe, expect, it } from 'vitest';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../layout/__fixtures__/layout-scale-fixtures';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
import { makeNodeProvenance } from '$lib/bench/plan-bench';
import {
	analyticalThreeCounts,
	countSvgElements,
	measureBrowserTier,
	renderPlanModelToSvg
} from '$lib/bench/browser-bench';

describe('browser-bench (deterministic tier)', () => {
	it('renders the Plan model to an SVG string with one element per primitive', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const compiled = compileLayoutGeometry(fixture).geometry;
		const model = buildPlanRenderModel(compiled);
		const svg = renderPlanModelToSvg(model, 60);

		expect(svg.startsWith('<svg ')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);

		const primitives = model.layers.reduce((sum, layer) => sum + layer.primitives.length, 0);
		expect(countSvgElements(svg)).toBe(primitives);
	});

	it('computes analytical chord-box counts from compiled solid spans', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const compiled = compileLayoutGeometry(fixture).geometry;
		const counts = analyticalThreeCounts(compiled);

		expect(counts.objectCount).toBeGreaterThan(0);
		expect(counts.materialCount).toBeGreaterThan(0);
		expect(counts.drawCalls).toBe(counts.objectCount);
		expect(counts.triangles).toBe(counts.objectCount * 12);
	});

	it('produces a complete, deterministic browser-tier report', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const first = measureBrowserTier(fixture, 'small', makeNodeProvenance(), { samples: 3 });
		const second = measureBrowserTier(fixture, 'small', makeNodeProvenance(), { samples: 3 });

		expect(first.samples.length).toBeGreaterThanOrEqual(8);
		for (const sample of first.samples) {
			expect(Number.isFinite(sample.value), sample.metric).toBe(true);
			expect(sample.value >= 0, sample.metric).toBe(true);
		}

		const byMetric = new Map(first.samples.map((sample) => [sample.metric, sample.value]));
		const again = new Map(second.samples.map((sample) => [sample.metric, sample.value]));
		// Counts and sizes are deterministic; timings are not compared.
		for (const metric of ['svg-node-count', 'three-object-estimate', 'three-material-estimate', 'three-draw-call-estimate', 'three-triangle-estimate'] as const) {
			expect(again.get(metric), metric).toBe(byMetric.get(metric));
		}
	});
});
