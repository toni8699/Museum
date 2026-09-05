/**
 * P21.4 — preview-surface import-closure validator (shared by the Vite build
 * plugin and Vitest fixtures).
 *
 * Walks the resolved, transformed module graph from the VisitorPreviewSurface
 * root through `importedIds` + `dynamicallyImportedIds` (Vite/Rollup resolved
 * IDs handle `$lib`, relative/ workspace imports, `.svelte` modules,
 * re-exports and literal dynamic imports; TS type-only imports are erased and
 * never appear as edges). Do not build a regex source parser on top of this.
 */

export type PreviewSurfaceModuleEdge = {
	imports: readonly string[];
	dynamicImports: readonly string[];
};

export type PreviewSurfaceGraph = {
	rootId: string;
	modules: ReadonlyMap<string, PreviewSurfaceModuleEdge>;
	/** Unresolvable computed dynamic imports found in the closure. */
	unresolvedDynamics?: ReadonlyArray<{ from: string; specifier: string }>;
};

const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
	{ pattern: /src\/lib\/editor\//, label: 'editor session/selection/history/gizmo/inspector/timeline' },
	{ pattern: /MuseumScene\.svelte/, label: 'bespoke MuseumScene' },
	{ pattern: /MuseumHUD\.svelte/, label: 'bespoke MuseumHUD' },
	{ pattern: /MuseumCanvas\.svelte/, label: 'museum canvas (Chopin-bound)' },
	{ pattern: /Workspace3DView\.svelte/, label: 'editor 3D view' },
	{ pattern: /EditorSceneEntities\.svelte/, label: 'editor scene entities' },
	{ pattern: /chopin-project/, label: 'runtime Chopin graph' },
	{ pattern: /chopin-room-presentation/, label: 'runtime Chopin presentation' },
	{ pattern: /content\/rooms/, label: 'Chopin rooms' },
	{ pattern: /chopin-layout/, label: 'Chopin layout' },
	{ pattern: /state\/runtime-state/, label: 'legacy runtime state (Chopin defaults)' },
	{ pattern: /museum\/navigation\/CameraDirector\.svelte/, label: 'legacy CameraDirector (Paris restriction)' },
	{ pattern: /museum\/MuseumEntities\.svelte/, label: 'MuseumEntities (Paris activation)' },
	{ pattern: /paris-activation/, label: 'Paris activation' },
	{ pattern: /museum\/rooms\//, label: 'bespoke room frames' },
	{ pattern: /museum\/layout\/LayoutMuseumShell\.svelte/, label: 'legacy layout shell (use visitor shell)' },
	{ pattern: /project\/project-codec/, label: 'project codec (editor-side validation only)' },
	{ pattern: /project-export-store/, label: 'cloud/export predicates (editor-side only)' },
	{ pattern: /binary-texture-store/, label: 'BinaryTextureStore (editor-side only)' }
];

export function isForbiddenPreviewSurfaceModule(id: string): string | null {
	for (const { pattern, label } of FORBIDDEN_PATTERNS) {
		if (pattern.test(id)) return label;
	}
	return null;
}

export type PreviewSurfaceValidation = {
	ok: boolean;
	rootId: string;
	reached: string[];
	forbidden: Array<{ id: string; via: string; reason: string }>;
	missing: Array<{ id: string; via: string }>;
	unresolvedDynamics: Array<{ from: string; specifier: string }>;
};

export function validatePreviewSurfaceGraph(graph: PreviewSurfaceGraph): PreviewSurfaceValidation {
	const reached: string[] = [];
	const forbidden: PreviewSurfaceValidation['forbidden'] = [];
	const missing: PreviewSurfaceValidation['missing'] = [];
	const seen = new Set<string>();
	const via = new Map<string, string>();
	const pending: string[] = [graph.rootId];
	via.set(graph.rootId, '<root>');

	if (!graph.modules.has(graph.rootId)) {
		return {
			ok: false,
			rootId: graph.rootId,
			reached: [],
			forbidden: [],
			missing: [{ id: graph.rootId, via: '<root>' }],
			unresolvedDynamics: [...(graph.unresolvedDynamics ?? [])]
		};
	}

	while (pending.length > 0) {
		const id = pending.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);
		reached.push(id);
		const edge = graph.modules.get(id);
		if (!edge) {
			missing.push({ id, via: via.get(id) ?? '<unknown>' });
			continue;
		}
		const reason = isForbiddenPreviewSurfaceModule(id);
		if (reason) {
			forbidden.push({ id, via: via.get(id) ?? '<unknown>', reason });
		}
		for (const next of [...edge.imports, ...edge.dynamicImports]) {
			if (!seen.has(next) && !via.has(next)) via.set(next, id);
			pending.push(next);
		}
	}

	const unresolvedDynamics = [...(graph.unresolvedDynamics ?? [])];
	const ok = forbidden.length === 0 && missing.length === 0 && unresolvedDynamics.length === 0;
	return { ok, rootId: graph.rootId, reached, forbidden, missing, unresolvedDynamics };
}

export function formatPreviewSurfaceValidation(result: PreviewSurfaceValidation): string {
	const lines: string[] = [];
	if (result.missing.length > 0) {
		for (const entry of result.missing) {
			lines.push(`missing module ${entry.id} (via ${entry.via})`);
		}
	}
	for (const entry of result.forbidden) {
		lines.push(`forbidden ${entry.reason}: ${entry.id} (via ${entry.via})`);
	}
	for (const entry of result.unresolvedDynamics) {
		lines.push(`unresolved dynamic import '${entry.specifier}' (via ${entry.from})`);
	}
	return lines.join('\n');
}
