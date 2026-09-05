import { describe, expect, it } from 'vitest';
import { findUnresolvedDynamicImports } from '../../vite/preview-surface-dynamic-scan';
import { previewSurfaceBoundaryPlugin } from '../../vite/preview-surface-boundary-plugin';

describe('preview-surface computed-dynamic scan', () => {
	it('ignores comments, strings and literal dynamics', () => {
		expect(findUnresolvedDynamicImports(`// const m = import(foo);`)).toEqual([]);
		expect(findUnresolvedDynamicImports(`/* import(foo); */ const x = 1;`)).toEqual([]);
		expect(
			findUnresolvedDynamicImports(`const m = await import('./Other.svelte');`)
		).toEqual([]);
		expect(findUnresolvedDynamicImports('const m = await import(`./Other.svelte`);')).toEqual(
			[]
		);
		expect(findUnresolvedDynamicImports(`import x from 'y';\nimport.meta.url;`)).toEqual(
			[]
		);
		expect(findUnresolvedDynamicImports(`obj.import(x); reimport(x);`)).toEqual([]);
		expect(findUnresolvedDynamicImports(`const m = await import(\n'./Other.svelte'\n);`)).toEqual(
			[]
		);
	});

	it('flags expression-form dynamics with specifier text', () => {
		expect(findUnresolvedDynamicImports(`const m = await import(name);`)).toEqual(['name']);
		expect(findUnresolvedDynamicImports(`const m = await import( './' + name );`)).toEqual([
			`'./' + name`
		]);
		const templated = findUnresolvedDynamicImports('const m = await import(`./${name}.svelte`);');
		expect(templated).toHaveLength(1);
		expect(templated[0]).toContain('name');
	});

	it('sees through ${} object literals without desyncing', () => {
		const code = 'const t = `${ {a: 1} }`; const m = await import(later);';
		expect(findUnresolvedDynamicImports(code)).toEqual(['later']);
	});
});

type ModuleInfo = { importedIds: string[]; dynamicallyImportedIds: string[] };

function stubContext(modules: Record<string, ModuleInfo>) {
	return {
		getModuleIds: () => Object.keys(modules),
		getModuleInfo: (id: string) => modules[id] ?? null
	};
}

const ROOT = '/src/lib/visitor/VisitorPreviewSurface.svelte';

describe('preview-surface boundary plugin (actual generateBundle)', () => {
	it('rejects a computed dynamic import recorded from transformed sources', () => {
		const plugin = previewSurfaceBoundaryPlugin() as unknown as {
			transform: (this: unknown, code: string, id: string) => unknown;
			generateBundle: (this: unknown, options: unknown, bundle: unknown) => void;
		};
		plugin.transform.call({}, `import Leaf from './Leaf.svelte';\nexport default Leaf;`, ROOT);
		plugin.transform.call({}, `export const m = import(specifier);`, '/src/lib/visitor/Leaf.svelte');
		const ctx = stubContext({
			[ROOT]: { importedIds: ['/src/lib/visitor/Leaf.svelte'], dynamicallyImportedIds: [] },
			'/src/lib/visitor/Leaf.svelte': { importedIds: [], dynamicallyImportedIds: [] }
		});
		expect(() => plugin.generateBundle.call(ctx, {}, {})).toThrow(/unresolved dynamic/);
	});

	it('passes literal dynamics resolved in the graph', () => {
		const plugin = previewSurfaceBoundaryPlugin() as unknown as {
			transform: (this: unknown, code: string, id: string) => unknown;
			generateBundle: (this: unknown, options: unknown, bundle: unknown) => void;
		};
		plugin.transform.call(
			{},
			`export async function load() { return import('./Leaf.svelte'); }`,
			ROOT
		);
		plugin.transform.call({}, `export default 1;`, '/src/lib/visitor/Leaf.svelte');
		const ctx = stubContext({
			[ROOT]: { importedIds: [], dynamicallyImportedIds: ['/src/lib/visitor/Leaf.svelte'] },
			'/src/lib/visitor/Leaf.svelte': { importedIds: [], dynamicallyImportedIds: [] }
		});
		expect(() => plugin.generateBundle.call(ctx, {}, {})).not.toThrow();
	});

	it('rejects a forbidden indirect runtime import through the plugin', () => {
		const plugin = previewSurfaceBoundaryPlugin() as unknown as {
			transform: (this: unknown, code: string, id: string) => unknown;
			generateBundle: (this: unknown, options: unknown, bundle: unknown) => void;
		};
		plugin.transform.call({}, `import './Leaf.svelte';`, ROOT);
		plugin.transform.call({}, `import '../editor/editor-store.svelte';`, '/src/lib/visitor/Leaf.svelte');
		plugin.transform.call({}, `export default 1;`, '/src/lib/editor/editor-store.svelte');
		const ctx = stubContext({
			[ROOT]: { importedIds: ['/src/lib/visitor/Leaf.svelte'], dynamicallyImportedIds: [] },
			'/src/lib/visitor/Leaf.svelte': {
				importedIds: ['/src/lib/editor/editor-store.svelte'],
				dynamicallyImportedIds: []
			},
			'/src/lib/editor/editor-store.svelte': { importedIds: [], dynamicallyImportedIds: [] }
		});
		expect(() => plugin.generateBundle.call(ctx, {}, {})).toThrow(/editor/);
	});
});
