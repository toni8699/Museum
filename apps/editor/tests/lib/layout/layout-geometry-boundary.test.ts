import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	compileLayoutGeometry,
	createEmptyLayoutDocument,
	validateLayoutDocument
} from '@portfolio/layout-core';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const libRoot = resolve(srcRoot, 'lib');
const layoutDir = resolve(srcRoot, '../../../packages/layout-core/src');

const COMPILER_FILES = readdirSync(layoutDir)
	.filter((name) => name.startsWith('layout-geometry') && name.endsWith('.ts') && !name.endsWith('.test.ts'))
	.map((name) => resolve(layoutDir, name));

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
const PACKAGE_SOURCE_FILES = walk(layoutDir).filter((file) => file.endsWith('.ts'));

function sourceOf(file: string): string {
	return readFileSync(file, 'utf8');
}

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? match[2] ?? '');
}

function packageFilesDefining(signature: string): string[] {
	return PACKAGE_SOURCE_FILES.filter((file) => sourceOf(file).includes(signature)).map((file) => file.slice(layoutDir.length + 1));
}

describe('G1 geometry boundary', () => {
	it('exposes the layout contract directly from layout-core', () => {
		const document = createEmptyLayoutDocument();
		expect(validateLayoutDocument(document).success).toBe(true);
		expect(compileLayoutGeometry(document).issues).toEqual([]);
	});

	it('keeps the compiler graph free of editor, Svelte, Three, and browser imports', () => {
		for (const file of PACKAGE_SOURCE_FILES) {
			const source = sourceOf(file);
			for (const specifier of importSpecifiers(source)) {
				expect(specifier.startsWith('$lib/editor')).toBe(false);
				expect(specifier.startsWith('$lib/museum')).toBe(false);
				expect(specifier).not.toMatch(/^(svelte|three|@threlte|\$app)/);
				expect(specifier.startsWith('.') || specifier.startsWith('$lib/types')).toBe(true);
			}
		}
	});

	it('defines each geometry kernel exactly once, under layout-core', () => {
		expect(packageFilesDefining('export function sampleSegment')).toEqual(['layout-geometry-curve.ts']);
		expect(packageFilesDefining('export function compileLayoutGeometry')).toEqual(['layout-geometry.ts']);
		expect(packageFilesDefining('export function splitWallAroundOpenings')).toEqual(['layout-geometry-openings.ts']);
		expect(packageFilesDefining('export function splitSampledWallAroundOpenings')).toEqual(['layout-geometry-openings.ts']);
		expect(packageFilesDefining('export function buildArchProfile')).toEqual(['layout-geometry-openings.ts']);
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
