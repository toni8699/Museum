import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const libRoot = resolve(appSrc, 'lib');
const entry = resolve(appSrc, 'routes/museum/+page.svelte');
const extensions = ['', '.ts', '.svelte', '.json'];

function resolveImport(importer: string, specifier: string): string | null {
	const base = specifier.startsWith('$lib/')
		? resolve(libRoot, specifier.slice('$lib/'.length))
		: specifier.startsWith('.')
			? resolve(dirname(importer), specifier)
			: null;
	if (!base) return null;
	for (const extension of extensions) {
		const candidate = `${base}${extension}`;
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

function visitorImportGraph(): Set<string> {
	const visited = new Set<string>();
	const pending = [entry];
	const pattern = /(?:import|export)\s+(?!type\b)[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
	while (pending.length > 0) {
		const file = pending.pop()!;
		if (visited.has(file)) continue;
		visited.add(file);
		if (extname(file) === '.json') continue;
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(pattern)) {
			const dependency = resolveImport(file, match[1] ?? match[2] ?? '');
			if (dependency && !visited.has(dependency)) pending.push(dependency);
		}
	}
	return visited;
}

describe('visitor import boundary', () => {
	it('uses one serialized project/layout path with no editor or legacy architecture imports', () => {
		const graph = visitorImportGraph();
		const relative = [...graph].map((file) => file.slice(appSrc.length + 1));
		expect(relative).toContain('lib/content/chopin-project.json');
		expect(relative).toContain('lib/museum/layout/LayoutMuseumShell.svelte');
		expect(relative.some((file) => file.includes('/editor/'))).toBe(false);
		expect(relative).not.toContain('lib/content/rooms.ts');
		expect(relative).not.toContain('lib/content/rooms-to-layout.ts');
		expect(relative).not.toContain('lib/content/museum-scene.json');
		expect(relative).not.toContain('lib/museum/layout/MuseumShell.svelte');
	});

	it('contains no architecture source toggle in visitor entry components', () => {
		for (const file of [
			entry,
			resolve(libRoot, 'museum/MuseumCanvas.svelte'),
			resolve(libRoot, 'museum/MuseumScene.svelte')
		]) {
			const source = readFileSync(file, 'utf8');
			expect(source).not.toContain('architectureSource');
			expect(source).not.toContain('architecture=layout');
		}
	});
});
