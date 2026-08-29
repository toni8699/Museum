import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LIB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../src/lib');

function readLibSource(relativePath: string): string {
	return readFileSync(resolve(LIB_ROOT, relativePath), 'utf8');
}

describe('P14 Camera Plan passive footprints', () => {
	it('wires the live Scene projection into both render-model branches', () => {
		const source = readLibSource('editor/camera-plan/CameraPlanViewport.svelte');
		const projection = source.match(/const sceneProjection = \$derived\.by\(\(\) => \{[\s\S]*?\n\t\}\);/u)?.[0];

		expect(projection).toBeTruthy();
		expect(projection).toContain('void preview.previewVersion;');
		expect(projection).toContain('buildPlanSceneFootprintProjection(');
		expect(projection).toContain('getEffectiveScale: getEffectiveSceneScale');
		expect(source).toContain('buildPlanRenderModel(preview.geometry, undefined, undefined, sceneProjection)');
		expect(source).toContain('}, undefined, sceneProjection);');
	});

	it('keeps Camera-only footprint styling on the Camera canvas', () => {
		const cameraPlan = readLibSource('editor/camera-plan/CameraPlanViewport.svelte');
		const planSvg = readLibSource('editor/layout/PlanSvg.svelte');

		expect(cameraPlan).toContain('--plan-footprint-stroke: var(--editor-camera-footprint-stroke)');
		expect(cameraPlan).toContain('--plan-footprint-fill: var(--editor-camera-footprint-fill)');
		expect(cameraPlan).toContain('--plan-layout-object-stroke: var(--editor-camera-footprint-stroke)');
		expect(cameraPlan).toContain('--plan-layout-object-fill: var(--editor-camera-footprint-fill)');
		expect(cameraPlan).toContain('--plan-layout-object-dasharray: 5 4');
		expect(planSvg).toContain('var(--plan-footprint-fill, rgb(146 144 138 / 12%))');
		expect(planSvg).toContain('var(--plan-footprint-stroke, var(--editor-plan-muted))');
		expect(planSvg).toContain('var(--plan-layout-object-fill, var(--editor-plan-object-fill))');
		expect(planSvg).toContain('var(--plan-layout-object-stroke, var(--editor-plan-object-stroke))');
		expect(planSvg).toContain('var(--plan-layout-object-dasharray, none)');
		expect(planSvg).toContain('var(--plan-layout-object-fill, var(--editor-plan-readonly-fill))');
		expect(planSvg).toContain('var(--plan-layout-object-dasharray, 5 3)');
		expect(planSvg).not.toContain('--editor-camera-footprint-');
	});
});
