import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const MODEL_FILE = resolve(srcRoot, 'lib/layout/plan-render-model.ts');
const HIT_FILE = resolve(srcRoot, 'lib/editor/layout/plan-hit.ts');
const ADAPTER_FILE = resolve(srcRoot, 'lib/editor/layout/PlanSvg.svelte');
const VIEWPORT_FILE = resolve(srcRoot, 'lib/editor/layout/LayoutPlanViewport.svelte');
const CAMERA_PROJECTION_FILE = resolve(srcRoot, 'lib/editor/layout/plan-camera-projection.ts');

const IMPORT_SPECIFIER = /from\s+['"]([^'"]+)['"]|import\(?\s*['"]([^'"]+)['"]/g;

function sourceOf(file: string): string {
	return readFileSync(file, 'utf8');
}

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? match[2] ?? '');
}

/** Asserts a module imports nothing renderer- or browser-coupled. */
function expectRendererFree(file: string): void {
	for (const specifier of importSpecifiers(sourceOf(file))) {
		expect(specifier).not.toMatch(/^(svelte|three|@threlte|\$app)/);
	}
}

describe('PlanRenderModel boundary', () => {
	it('keeps the model free of editor, Svelte, Three, and browser imports', () => {
		const source = sourceOf(MODEL_FILE);
		for (const specifier of importSpecifiers(source)) {
			expect(specifier.startsWith('$lib/editor')).toBe(false);
			expect(specifier.startsWith('$lib/museum')).toBe(false);
			expect(specifier).not.toMatch(/^(svelte|three|@threlte|\$app)/);
			expect(specifier.startsWith('.') || specifier.startsWith('$lib/types')).toBe(true);
		}
	});

	it('resolves camera/tour and interaction data through inputs, never through scene imports', () => {
		const source = sourceOf(MODEL_FILE);
		expect(source).not.toContain('camera-route');
		expect(source).not.toContain('camera-motion');
		expect(source).not.toContain('navigationGraph');
		expect(source).not.toContain('resolveSceneDocument');
	});

	it('defines the builder once and never mutates compiled inputs', () => {
		const source = sourceOf(MODEL_FILE);
		expect(source).toContain('export function buildPlanRenderModel');
		expect(source).not.toContain('.push(compiled');
	});
});

describe('plan-hit boundary', () => {
	it('resolves hits from compiled query records only, with no Svelte/DOM/Three or editor imports', () => {
		const source = sourceOf(HIT_FILE);
		expectRendererFree(HIT_FILE);
		for (const specifier of importSpecifiers(source)) {
			expect(specifier.startsWith('$lib/layout')).toBe(true);
			expect(specifier.startsWith('$lib/editor')).toBe(false);
			expect(specifier.startsWith('$lib/museum')).toBe(false);
		}
		expect(source).toContain('export function resolvePlanHit');
		expect(source).toContain('projectPointToSpans');
		expect(source).toContain('findPolygonContaining');
	});

	it('owns no view-transform math', () => {
		const source = sourceOf(HIT_FILE);
		expect(source).not.toContain('worldToPlanScreen');
		expect(source).not.toContain('planScreenToWorld');
		expect(source).not.toContain('pixelsPerMeter');
	});
});

describe('PlanSvg adapter boundary', () => {
	it('renders the model only — no geometry kernel, no hit resolution, no camera resolution', () => {
		const source = sourceOf(ADAPTER_FILE);
		expect(source).toContain('worldToPlanScreen');
		expect(source).toContain('plan-render-model');
		expect(source).not.toContain('compileLayoutGeometry');
		expect(source).not.toContain('layout-geometry-queries');
		expect(source).not.toContain('CompiledLayoutGeometry');
		expect(source).not.toContain('buildPlanRenderModel');
		expect(source).not.toContain('resolvePlanHit');
		expect(source).not.toContain('getCameraConnectionRoute');
		expect(source).not.toContain('resolveSceneDocument');
		expect(source).not.toContain('createNavigationGraph');
		expect(source).not.toContain('LayoutSelection');
		expect(source).not.toContain('layout-interaction');
	});

	it('is Svelte/DOM-adjacent only through the component itself, never browser-coupled imports', () => {
		expectRendererFree(ADAPTER_FILE);
	});
});

describe('LayoutPlanViewport boundary', () => {
	it('assembles no render order inline — it builds the model and delegates rendering to PlanSvg', () => {
		const source = sourceOf(VIEWPORT_FILE);
		expect(source).toContain('buildPlanRenderModel');
		expect(source).toContain('PlanSvg');
		expect(source).not.toContain('{#each model.rooms');
		expect(source).not.toContain('{#each model.objects');
		for (const classLiteral of [
			'room-fill',
			'room-outline',
			'wall-line',
			'opening-line',
			'layout-object',
			'vertex-handle',
			'interior-anchor',
			'dimension-label',
			'primitive-ghost',
			'draft-outline',
			'draft-point',
			'rotation-handle',
			'rotation-arm',
			'selection-bounds',
			'rotation-feedback'
		]) {
			expect(source).not.toContain(`class="${classLiteral}"`);
		}
	});

	it('owns no world-to-screen rendering transform', () => {
		expect(sourceOf(VIEWPORT_FILE)).not.toContain('worldToPlanScreen');
	});

	it('owns no inline hit geometry — hit resolution lives in plan-hit', () => {
		const source = sourceOf(VIEWPORT_FILE);
		expect(source).toContain('resolvePlanHit');
		for (const retired of [
			'findPlanHitTarget',
			'nearestVertexTarget',
			'nearestInteriorAnchorTarget',
			'nearestOpeningTarget',
			'nearestWallTarget',
			'findHitRoom'
		]) {
			expect(source).not.toContain(retired);
		}
	});
});

describe('Plan camera projection boundary', () => {
	it('reuses camera-route/camera-motion and scene resolution instead of re-deriving motion', () => {
		const source = sourceOf(CAMERA_PROJECTION_FILE);
		expect(source).toContain('getCameraConnectionRoute');
		expect(source).toContain('getCameraMotionOptions');
		expect(source).toContain('camera-route');
		expect(source).toContain('camera-motion');
		expect(source).toContain('resolveSceneDocument');
		expect(source).toContain('createNavigationGraph');
		expect(source).toContain('export function buildPlanCameraProjection');
		expect(source).not.toContain('export function getCameraConnectionRoute');
		expect(source).not.toContain('export function getCameraMotionOptions');
		expect(source).not.toContain('export function getGuidedCameraRoute');
	});

	it('is renderer-free', () => {
		expectRendererFree(CAMERA_PROJECTION_FILE);
	});
});
