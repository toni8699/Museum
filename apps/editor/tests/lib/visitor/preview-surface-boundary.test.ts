import { describe, expect, it } from 'vitest';
import {
	isForbiddenPreviewSurfaceModule,
	validatePreviewSurfaceGraph
} from '$lib/visitor/preview-surface-boundary';

function graphFrom(
	rootId: string,
	edges: Record<string, { imports?: string[]; dynamicImports?: string[] }>,
	unresolvedDynamics: Array<{ from: string; specifier: string }> = []
) {
	return {
		rootId,
		modules: new Map(
			Object.entries(edges).map(([id, edge]) => [
				id,
				{ imports: edge.imports ?? [], dynamicImports: edge.dynamicImports ?? [] }
			])
		),
		unresolvedDynamics
	};
}

describe('preview-surface-boundary validator', () => {
	it('allows alias/Svelte indirection through generic leaves', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: ['$lib/visitor/VisitorEntities.svelte'] },
				// Alias indirection: $lib resolves to src/lib; Svelte re-export
				// lands on a leaf with no Chopin edge.
				'$lib/visitor/VisitorEntities.svelte': {
					imports: ['$lib/museum/assets/AssetModel.svelte']
				},
				'$lib/museum/assets/AssetModel.svelte': { imports: [] }
			})
		);
		expect(result.ok).toBe(true);
		expect(result.forbidden).toEqual([]);
	});

	it('allows literal dynamic imports resolved in the graph', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: [], dynamicImports: ['./VisitorEntities.svelte'] },
				'./VisitorEntities.svelte': { imports: [] }
			})
		);
		expect(result.ok).toBe(true);
	});

	it('allows erased type-only imports (absent from the graph)', () => {
		// Type-only `import type { ... }` erases at transform time, so the
		// resolved graph contains no edge. Absence is allowed.
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: [] }
			})
		);
		expect(result.ok).toBe(true);
	});

	it('rejects a forbidden indirect runtime import with source IDs', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const leaf = '/src/lib/visitor/VisitorEntities.svelte';
		const forbidden = '/src/lib/museum/MuseumEntities.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: [leaf] },
				[leaf]: { imports: [forbidden] },
				[forbidden]: { imports: [] }
			})
		);
		expect(result.ok).toBe(false);
		expect(result.forbidden).toHaveLength(1);
		expect(result.forbidden[0]!.id).toBe(forbidden);
		expect(result.forbidden[0]!.via).toBe(leaf);
	});

	it('rejects editor session modules in the closure', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const editorStore = '/src/lib/editor/editor-store.svelte';
		expect(isForbiddenPreviewSurfaceModule(editorStore)).toContain('editor');
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: [editorStore] },
				[editorStore]: { imports: [] }
			})
		);
		expect(result.ok).toBe(false);
	});

	it('fails on a missing root', () => {
		const result = validatePreviewSurfaceGraph(graphFrom('/missing.svelte', {}));
		expect(result.ok).toBe(false);
		expect(result.missing[0]!.id).toBe('/missing.svelte');
	});

	it('fails on unresolved internal edges', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(root, {
				[root]: { imports: ['/src/lib/visitor/Gone.svelte'] }
			})
		);
		expect(result.ok).toBe(false);
		expect(result.missing[0]!.id).toBe('/src/lib/visitor/Gone.svelte');
	});

	it('rejects unresolvable computed dynamic imports', () => {
		const root = '/src/lib/visitor/VisitorPreviewSurface.svelte';
		const result = validatePreviewSurfaceGraph(
			graphFrom(
				root,
				{ [root]: { imports: [] } },
				[{ from: root, specifier: 'variable' }]
			)
		);
		expect(result.ok).toBe(false);
		expect(result.unresolvedDynamics).toHaveLength(1);
	});
});
