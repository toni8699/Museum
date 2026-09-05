import path from 'node:path';
import type { Plugin } from 'vite';
import {
	formatPreviewSurfaceValidation,
	validatePreviewSurfaceGraph,
	type PreviewSurfaceModuleEdge
} from '../src/lib/visitor/preview-surface-boundary';

/**
 * P21.4 — Editor-build preview-surface bundle gate.
 *
 * Walks Vite/Rollup's resolved, transformed module graph from the isolated
 * `VisitorPreviewSurface` root through `importedIds` +
 * `dynamicallyImportedIds` (before relying on output chunk grouping). Missing
 * root, unresolved internal edges and forbidden runtime modules fail the
 * build. The existing standalone `/museum` verifier remains a separate
 * manifest-based gate; this gate never targets the whole preview route or a
 * shared output chunk containing the retained owner.
 */
export function previewSurfaceBoundaryPlugin(): Plugin {
	return {
		name: 'preview-surface-boundary',
		generateBundle(_options, _bundle) {
			const getModuleInfo = this.getModuleInfo.bind(this);
			const getModuleIds = this.getModuleIds.bind(this);

			let rootId: string | null = null;
			for (const id of getModuleIds()) {
				if (id.endsWith('lib/visitor/VisitorPreviewSurface.svelte')) {
					rootId = id;
					break;
				}
			}
			if (!rootId) {
				throw new Error(
					'[preview-surface-boundary] missing root: lib/visitor/VisitorPreviewSurface.svelte not in module graph'
				);
			}

			const modules = new Map<string, PreviewSurfaceModuleEdge>();
			const pending: string[] = [rootId];
			const seen = new Set<string>();
			while (pending.length > 0) {
				const id = pending.pop()!;
				if (seen.has(id)) continue;
				seen.add(id);
				const info = getModuleInfo(id);
				if (!info) {
					modules.set(id, { imports: [], dynamicImports: [] });
					continue;
				}
				const imports = [...(info.importedIds ?? [])];
				const dynamicImports = [...(info.dynamicallyImportedIds ?? [])];
				modules.set(id, { imports, dynamicImports });
				for (const next of [...imports, ...dynamicImports]) {
					if (!seen.has(next)) pending.push(next);
				}
			}

			// Seed missing-edge detection: any edge whose target has no module
			// info is recorded as missing by the validator (modules map lacks it
			// only when getModuleInfo returned null above — here we ensure every
			// edge target is present as a key, with empty edges for missing, so
			// the validator reports them via the missing path).
			const result = validatePreviewSurfaceGraph({
				rootId,
				modules,
				unresolvedDynamics: []
			});
			// Re-check missing: edges pointing outside getModuleIds() (null info)
			// were seeded as empty; the validator treats empty-edge modules as
			// reached (not missing). Detect them explicitly here.
			const trulyMissing: string[] = [];
			for (const [id] of modules) {
				if (!getModuleInfo(id)) trulyMissing.push(id);
			}
			if (trulyMissing.length > 0 || !result.ok) {
				const details = [
					...trulyMissing.map((id) => `missing module ${id}`),
					formatPreviewSurfaceValidation(result)
				]
					.filter(Boolean)
					.join('\n');
				throw new Error(
					`[preview-surface-boundary] VisitorPreviewSurface import closure violates isolation:\n${details}\n(root: ${path.relative(process.cwd(), rootId)})`
				);
			}
		}
	};
}
