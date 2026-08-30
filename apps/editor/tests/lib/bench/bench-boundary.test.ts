import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '../../../src');
const benchDir = resolve(srcRoot, 'lib/bench');
const fixturesDir = resolve(here, '../layout/__fixtures__');

// Pure/deterministic harness modules: no Svelte, Three, Threlte, or app imports.
const PURE_BENCH_FILES = ['bench-types.ts', 'bench-harness.ts', 'bench-report.ts', 'plan-bench.ts', 'browser-bench.ts'];
// Live-GPU helper: browser-only, Three allowed.
const THREE_BENCH_FILES = ['three-stats.ts'];

const IMPORT_SPECIFIER = /from\s+['"]([^'"]+)['"]|import\(?\s*['"]([^'"]+)['"]/g;

function sourceOf(file: string): string {
	return readFileSync(file, 'utf8');
}

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? match[2] ?? '');
}

describe('G3 harness boundary', () => {
	it('keeps the deterministic harness free of Svelte, Three, Threlte, and app imports', () => {
		for (const name of PURE_BENCH_FILES) {
			const source = sourceOf(resolve(benchDir, name));
			for (const specifier of importSpecifiers(source)) {
				expect(specifier, `${name} imports ${specifier}`).not.toMatch(/^(svelte|three|@threlte|\$app)/);
				expect(specifier.startsWith('$lib/museum')).toBe(false);
			}
		}
	});

	it('allows Three only in the live-GPU helper', () => {
		const source = sourceOf(resolve(benchDir, 'three-stats.ts'));
		expect(importSpecifiers(source).some((specifier) => specifier === 'three')).toBe(true);
		for (const specifier of importSpecifiers(source)) {
			expect(specifier).not.toMatch(/^(svelte|@threlte|\$app)/);
		}
	});

	it('keeps the scale fixtures free of editor, Svelte, Three, and app imports', () => {
		const source = sourceOf(resolve(fixturesDir, 'layout-scale-fixtures.ts'));
		for (const specifier of importSpecifiers(source)) {
			expect(specifier).not.toMatch(/^(svelte|three|@threlte|\$app|\$lib\/editor|\$lib\/museum)/);
		}
	});

	it('gates the dev perf route behind dev mode', () => {
		const server = sourceOf(resolve(srcRoot, 'routes/dev/perf/+page.server.ts'));
		expect(server).toContain('if (!dev) error(404');
		const page = sourceOf(resolve(srcRoot, 'routes/dev/perf/+page.svelte'));
		expect(page).toContain('{#if dev}');
	});

	it('leaves no other bench modules importing three', () => {
		const otherThreeImporters = readdirSync(benchDir)
			.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !THREE_BENCH_FILES.includes(name))
			.filter((name) => importSpecifiers(sourceOf(resolve(benchDir, name))).includes('three'));
		expect(otherThreeImporters).toEqual([]);
	});
});
