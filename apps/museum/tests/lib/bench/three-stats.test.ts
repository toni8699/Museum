import { describe, expect, it } from 'vitest';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { chopinProject } from '$lib/content/chopin-project';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../layout/__fixtures__/layout-scale-fixtures';
import {
	chopinWallMeshRenderPolicyFactory,
	visitorWallMeshPolicy
} from '$lib/bench/browser-bench';
import { buildWallMeshScene } from '$lib/bench/three-stats';

describe('three-stats wall-mesh scene', () => {
	it('builds the Chopin visitor scene with 6 rooms (bespoke shell excluded before build)', () => {
		const compiled = compileLayoutGeometry(chopinProject.layout).geometry;
		const policy = chopinWallMeshRenderPolicyFactory()(compiled);
		const scene = buildWallMeshScene(compiled, policy);

		// 7 layout rooms minus the bespoke music-chamber shell — must match
		// `estimateWallMeshTopology` and the live `LayoutMuseumShell`, not the
		// editor's all-rooms preflight.
		expect(scene.counts.objectCount).toBe(6);
		expect(scene.counts.materialCount).toBe(6);
		expect(scene.counts.drawCalls).toBe(6);
		expect(scene.counts.triangles).toBeGreaterThan(0);
		expect(scene.scene.children).toHaveLength(6);
		expect(() => scene.dispose()).not.toThrow();
	});

	it('builds every room under the default visitor policy (no exclusions)', () => {
		const fixture = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const compiled = compileLayoutGeometry(fixture).geometry;
		const scene = buildWallMeshScene(compiled, visitorWallMeshPolicy(compiled));

		expect(scene.counts.objectCount).toBe(compiled.rooms.length);
		expect(scene.counts.drawCalls).toBe(compiled.rooms.length);
		expect(scene.scene.children).toHaveLength(compiled.rooms.length);
		expect(() => scene.dispose()).not.toThrow();
	});
});
