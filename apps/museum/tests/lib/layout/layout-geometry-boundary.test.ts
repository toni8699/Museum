import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const libRoot = resolve(srcRoot, 'lib');
const layoutDir = resolve(libRoot, 'layout');

const COMPILER_FILES = readdirSync(layoutDir)
	.filter((name) => name.startsWith('layout-geometry') && name.endsWith('.ts') && !name.endsWith('.test.ts'))
	.map((name) => resolve(layoutDir, name));

const REEXPORT_FILES = [
	'lib/editor/layout/curve-geometry.ts',
	'lib/editor/layout/arch-profile.ts',
	'lib/editor/layout/draft-geometry.ts',
	'lib/editor/layout/layout-auto-bezier.ts',
	'lib/editor/layout/layout-validation.ts'
].map((relative) => resolve(srcRoot, relative));

const CONSUMER_FILES = [
	'lib/museum/layout/LayoutMuseumShell.svelte',
	'lib/editor/layout/LayoutPreviewScene.svelte',
	'lib/editor/layout/LayoutPlanViewport.svelte',
	'lib/content/chopin-project.ts'
].map((relative) => resolve(srcRoot, relative));

const IMPORT_SPECIFIER = /from\s+['"]([^'"]+)['"]|import\(?\s*['"]([^'"]+)['"]/g;

function walk(dir: string): string[] {
	const entries = readdirSync(dir).map((name) => resolve(dir, name));
	const files: string[] = [];
	for (const entry of entries) {
		const stat = statSync(entry);
		if (stat.isDirectory()) files.push(...walk(entry));
		else if (stat.isFile()) files.push(entry);
	}
	return files;
}

const ALL_SOURCE_FILES = walk(libRoot).filter(
	(file) => !file.includes('.test.') && ['.ts', '.svelte'].includes(extname(file))
);

function sourceOf(file: string): string {
	return readFileSync(file, 'utf8');
}

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? match[2] ?? '');
}

function filesDefining(signature: string): string[] {
	return ALL_SOURCE_FILES.filter((file) => sourceOf(file).includes(signature)).map((file) => file.slice(libRoot.length + 1));
}

describe('G1 geometry boundary', () => {
	it('keeps the compiler graph free of editor, Svelte, Three, and browser imports', () => {
		for (const file of COMPILER_FILES) {
			const source = sourceOf(file);
			for (const specifier of importSpecifiers(source)) {
				expect(specifier.startsWith('$lib/editor')).toBe(false);
				expect(specifier.startsWith('$lib/museum')).toBe(false);
				expect(specifier).not.toMatch(/^(svelte|three|@threlte|\$app)/);
				expect(specifier.startsWith('.') || specifier.startsWith('$lib/types')).toBe(true);
			}
		}
	});

	it('defines each geometry kernel exactly once, under $lib/layout', () => {
		expect(filesDefining('export function sampleSegment')).toEqual(['layout/layout-geometry-curve.ts']);
		expect(filesDefining('export function compileLayoutGeometry')).toEqual(['layout/layout-geometry.ts']);
		expect(filesDefining('export function splitWallAroundOpenings')).toEqual(['layout/layout-geometry-openings.ts']);
		expect(filesDefining('export function splitSampledWallAroundOpenings')).toEqual(['layout/layout-geometry-openings.ts']);
		expect(filesDefining('export function buildArchProfile')).toEqual(['layout/layout-geometry-openings.ts']);
	});

	it('keeps the editor compatibility files as pure re-exports', () => {
		for (const file of REEXPORT_FILES) {
			const source = sourceOf(file);
			expect(source).not.toContain('export function');
			expect(source).not.toContain('function ');
			expect(source).toContain("from '$lib/layout/");
		}
	});

	it('removes all retired resampling helpers', () => {
		for (const signature of [
			'projectPointToDraftSegment',
			'openingSamplePolyline',
			'segmentPointAtOffset',
			'buildLayoutArchitectureModel'
		]) {
			expect(ALL_SOURCE_FILES.filter((file) => sourceOf(file).includes(signature))).toEqual([]);
		}
	});

	it('renders every consumer from compiled geometry without independent resampling', () => {
		for (const file of CONSUMER_FILES) {
			const source = sourceOf(file);
			expect(source).not.toContain('buildLayoutArchitectureModel');
			expect(source).not.toContain('buildLayoutPreviewModel');
			expect(source).not.toContain('splitWallAroundOpenings(');
			expect(source).not.toContain('buildArchProfile(');
			expect(source).not.toContain('sampleSegment(');
		}
	});

	it('routes Plan, editor 3D, and visitor 3D through the shared compiler contract', () => {
		expect(sourceOf(resolve(srcRoot, 'lib/content/chopin-project.ts'))).toContain('compileLayoutGeometry');
		expect(sourceOf(resolve(srcRoot, 'lib/museum/layout/LayoutMuseumShell.svelte'))).toContain('CompiledLayoutGeometry');
		// G4: the editor 3D scene consumes prebuilt wall meshes, not per-span chord boxes.
		const editorSceneSource = sourceOf(resolve(srcRoot, 'lib/editor/layout/LayoutPreviewScene.svelte'));
		expect(editorSceneSource).toContain('wallMeshesByRoom');
		expect(editorSceneSource).toContain('toWallBufferGeometry');
		expect(editorSceneSource).not.toContain('solidSpans');
		const planSource = sourceOf(resolve(srcRoot, 'lib/editor/layout/LayoutPlanViewport.svelte'));
		expect(planSource).toContain('resolvePlanHit');
		expect(planSource).toContain('model.queries');
		expect(planSource).not.toContain('$lib/layout/layout-geometry-curve');
		const planHitSource = sourceOf(resolve(srcRoot, 'lib/editor/layout/plan-hit.ts'));
		expect(planHitSource).toContain('$lib/layout/layout-geometry-queries');
		expect(planHitSource).toContain('projectPointToSpans');
	});
});
