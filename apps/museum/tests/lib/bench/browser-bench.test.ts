import { describe, expect, it } from 'vitest';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../layout/__fixtures__/layout-scale-fixtures';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildPlanRenderModel } from '$lib/layout/plan-render-model';	import { makeNodeProvenance } from '$lib/bench/plan-bench';
	import { chopinProject } from '$lib/content/chopin-project';
	import {
		chopinWallMeshRenderPolicyFactory,
		countSvgElements,
		estimateWallMeshTopology,
		measureBrowserTier,
		renderPlanModelToSvg,
		visitorWallMeshPolicy
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

	it('estimates indexed wall-mesh topology from real built meshes', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const compiled = compileLayoutGeometry(fixture).geometry;
		const counts = estimateWallMeshTopology(compiled, visitorWallMeshPolicy(compiled));

		// One mesh per room (visitor policy collapses to one surface class), so
		// object count = room count, one draw call per room, and triangles are
		// the real indexed count (not 12 per chord box).
		expect(counts.objectCount).toBe(compiled.rooms.length);
		expect(counts.materialCount).toBeGreaterThan(0);
		expect(counts.drawCalls).toBe(counts.objectCount);
		expect(counts.triangles).toBeGreaterThan(0);
	});

	it('matches the live visitor scene for Chopin: 6 rooms, not 7', () => {
		const compiled = compileLayoutGeometry(chopinProject.layout).geometry;
		// Production policy: real presentation tints + bespoke-shell exclusion.
		const policy = chopinWallMeshRenderPolicyFactory()(compiled);
		const counts = estimateWallMeshTopology(compiled, policy);
		// 7 layout rooms minus the bespoke music-chamber shell the scene
		// excludes before building — the production layout shell renders 6.
		expect(counts.objectCount).toBe(6);
		expect(counts.drawCalls).toBe(6);
		// All six visitor rooms carry distinct presentation tints.
		expect(counts.materialCount).toBe(6);
		expect(counts.triangles).toBeGreaterThan(0);
	});

	it('keeps the default visitor policy at the full room count for non-Chopin fixtures', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const compiled = compileLayoutGeometry(fixture).geometry;
		const counts = estimateWallMeshTopology(compiled, visitorWallMeshPolicy(compiled));
		expect(counts.objectCount).toBe(compiled.rooms.length);
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
