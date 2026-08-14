import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chopinProject } from '$lib/content/chopin-project';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../../../tests/lib/layout/__fixtures__/layout-scale-fixtures';
import { measureNodeTier, makeNodeProvenance, DEFAULT_NODE_OPTIONS, type NodeTierOptions } from './plan-bench';
import { chopinWallMeshRenderPolicyFactory, measureBrowserTier, type BrowserTierOptions } from './browser-bench';
import {
	BENCH_METHOD_VERSION,
	type BenchMetricName,
	type BenchProvenance,
	type BenchTier,
	type BenchTierResult,
	type Budget,
	type BudgetBaseline
} from './bench-types';

/**
 * Executable version-3 baseline recorder. Invoked via the `bench:record` npm
 * script (never a default-suite test, so `npm test` cannot rewrite the checked-in
 * baseline). Measures the Node + browser tiers for Chopin and the generated
 * scale fixtures, stamps version 3 provenance (HEAD SHA + `treeDirty` flag +
 * deterministic `contentHash` of the relevant sources), and writes
 * `g3-baseline.json`.
 */

const APPS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** Output path for the recorded baseline (used by the `bench:record` CLI runner). */
export const BASELINE_PATH = resolve(APPS_ROOT, 'src/lib/bench/baselines/g3-baseline.json');

/** Reduced sampling for the slow 1,000-room tier (same config for both tiers). */
const LARGE_OPTIONS: NodeTierOptions = { warmup: 1, samples: 3, hitPoints: 40, tolerance: 0.2 };

const TIER_ORDER: readonly BenchTier[] = ['chopin', 'small', 'medium', 'large'];

/**
 * The Chopin golden-fixture budget policy. Every metric is declared here with
 * a recorded reason; `recordBaseline()` persists this table alongside the
 * fresh tier measurements. Only the deterministic metrics (see
 * `ENFORCED_BUDGET_METRICS`) are enforced against live measurements; the
 * wall-clock metrics remain recorded but advisory until the H1 product has a
 * representative fixture and stable CI. The three `three-*-estimate` bounds
 * and the `wall-mesh-build` metric reflect the G4 indexed-mesh topology (one
 * watertight mesh per room) rather than the retired one-box-per-span chord
 * boxes.
 */
export const BUDGETS: Partial<Record<BenchMetricName, Budget>> = {
	'layout-compile': {
		target: 30,
		fail: 60,
		reason:
			'Measured 2026-08-13 p50 ~10 ms on the Chopin layout (node tier); target = 2x headroom, fail = 4x regression bound.'
	},
	'plan-render-build': {
		target: 1,
		fail: 5,
		reason:
			'Measured 2026-08-13 p50 ~0.08 ms on the Chopin layout (node tier); near-noise floor with generous headroom.'
	},
	'wall-mesh-build': {
		target: 30,
		fail: 60,
		reason:
			'G4 deterministic metric: one watertight indexed wall mesh per room (7 rooms, ~14.3k triangles — the bevel bridge + reveal geometry added over the original 9.4k). Measured 2026-08-14 p50 ~19 ms on quiet runs, ~30–41 ms on loaded runs (5-sample median is noisy); fail = 2x of the target so only a real topology regression trips.'
	},
	'hit-test': {
		target: 0.5,
		fail: 2,
		reason:
			'Measured 2026-08-13 p50 ~0.10 ms per point on the Chopin layout; fail allows ~20x before tripping so only a real O(n) regression fails.'
	},
	'snap-query': {
		target: 0.01,
		fail: 0.05,
		reason:
			'Measured 2026-08-13 p50 ~0.0005 ms per point on the Chopin layout; near-noise floor with generous headroom.'
	},
	'compiled-memory': {
		target: 4000000,
		fail: 8000000,
		reason:
			'Measured 2026-08-13 2,201,474 bytes serialized compiled geometry for Chopin; target/fail bound a 2x/4x footprint regression.'
	},
	'cache-key-code-units': {
		target: 700000,
		fail: 1300000,
		reason:
			'Measured 2026-08-13 620,268 UTF-16 code units of stored cacheKey strings for Chopin; the deterministic allocation backlog #10 targets, with fail = 2x regression bound.'
	},
	'svg-node-count': {
		target: 100,
		fail: 150,
		reason: 'Measured 2026-08-13 71 SVG nodes for the Chopin Plan model; fail = ~2x catches SVG node bloat.'
	},
	'three-object-estimate': {
		target: 20,
		fail: 60,
		reason:
			'G4 before→after: 1,166 one-box-per-span objects → 6 (one watertight indexed mesh per visitor room; the bespoke music-chamber shell is excluded exactly as the live LayoutMuseumShell does). Re-measured on re-record = 6; fail = ~10x catches a return to per-span object proliferation.'
	},
	'three-material-estimate': {
		target: 20,
		fail: 60,
		reason:
			'G4 before→after: 28 chord-box material groups → 6 (one shared presentation tint per visitor room). Re-measured on re-record = 6; fail = ~10x catches material proliferation.'
	},
	'three-draw-call-estimate': {
		target: 20,
		fail: 60,
		reason:
			'G4 before→after: 1,166 per-span draw calls → 6 (one surface-class group per visitor room). Re-measured on re-record = 6; fail = ~10x catches draw-call collapse regressions.'
	},
	'three-triangle-estimate': {
		target: 19000,
		fail: 38000,
		reason:
			'G4 before→after: 13,992 chord-box triangles → 12,876 real indexed wall-mesh triangles across the 6 visitor rooms (bespoke shell excluded; the G4 bevel/jamb work adds real corner-bridge and reveal geometry over the old 7-room 9,388). Re-measured on re-record = 12,876; target ≈ 1.5x, fail ≈ 3x catches triangle bloat.'
	}
};

function gitHeadSha(): string {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: APPS_ROOT, encoding: 'utf8' }).trim();
	} catch {
		return 'local';
	}
}

function gitTreeDirty(): boolean {
	try {
		return execFileSync('git', ['status', '--porcelain'], { cwd: APPS_ROOT, encoding: 'utf8' }).trim().length > 0;
	} catch {
		return false;
	}
}

/**
 * Roots of the sources whose content determines the measured results: recorder
 * + harness + policy + hit path + curve/validation code + project data +
 * fixtures. Each root is expanded to its full transitive import closure before
 * hashing, so a change to a dependency (e.g. the project/layout codecs that
 * normalize the Chopin document) also changes the hash without being listed
 * here by hand. The generated `g3-baseline.json` itself is deliberately
 * excluded — hashing the recorder's own output would create an unstable
 * self-reference. Files are hashed in sorted order so the hash is
 * order-independent.
 */
const CONTENT_SOURCES = [
	'src/lib/bench/bench-harness.ts',
	'src/lib/bench/bench-report.ts',
	'src/lib/bench/bench-types.ts',
	'src/lib/bench/browser-bench.ts',
	'src/lib/bench/plan-bench.ts',
	'src/lib/bench/record-baseline.ts',
	'src/lib/bench/three-stats.ts',
	'src/lib/content/chopin-project.json',
	'src/lib/content/chopin-project.ts',
	'src/lib/content/chopin-room-presentation.ts',
	'src/lib/content/materials.ts',
	'src/lib/editor/layout/plan-hit.ts',
	'src/lib/layout/layout-geometry-curve.ts',
	'src/lib/layout/layout-geometry-objects.ts',
	'src/lib/layout/layout-geometry-openings.ts',
	'src/lib/layout/layout-geometry-queries.ts',
	'src/lib/layout/layout-geometry-types.ts',
	'src/lib/layout/layout-geometry-validation.ts',
	'src/lib/layout/layout-geometry.ts',
	'src/lib/layout/plan-render-model.ts',
	'src/lib/layout/wall-mesh-builder.ts',
	'src/lib/museum/layout/wall-material-factory.ts',
	'src/lib/render/wall-geometry-adapter.ts',
	'tests/lib/layout/__fixtures__/layout-scale-fixtures.ts'
];

/**
 * Module specifiers from `import`/`export … from` statements. Bare and
 * type-only imports are captured too — the resolver skips bare packages and
 * over-including a type-only file is harmless for a reproducibility hash.
 */
function importSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	const pattern = /\b(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/g;
	for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
	return specifiers;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.json', '.svelte'] as const;

/** Resolve a `$lib/…` or relative specifier to an existing project source file, else null. */
function resolveSourceSpecifier(specifier: string, importer: string): string | null {
	// Bare package specifiers (node_modules) are pinned by the lockfile, not by
	// project source content, so they are not part of the content hash.
	if (!specifier.startsWith('.') && !specifier.startsWith('$lib')) return null;

	const base = specifier.startsWith('$lib')
		? resolve(APPS_ROOT, 'src/lib', specifier.slice('$lib'.length).replace(/^\/+/, ''))
		: resolve(dirname(importer), specifier);

	const candidates =
		extname(base) === ''
			? [
					base,
					...SOURCE_EXTENSIONS.map((extension) => base + extension),
					...SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`))
				]
			: [base];

	for (const candidate of candidates) {
		try {
			if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
		} catch {
			// fall through to the next candidate
		}
	}
	return null;
}

/** Expand the declared source roots to every project file they transitively import. */
function sourceClosure(entries: readonly string[]): string[] {
	const seen = new Set<string>();
	const queue = entries.map((entry) => resolve(APPS_ROOT, entry));
	const sources: string[] = [];

	while (queue.length > 0) {
		const absolute = queue.pop()!;
		if (seen.has(absolute)) continue;
		seen.add(absolute);
		sources.push(absolute);

		let text: string;
		try {
			text = readFileSync(absolute, 'utf8');
		} catch {
			continue; // non-file root — nothing to import
		}
		for (const specifier of importSpecifiers(text)) {
			const resolved = resolveSourceSpecifier(specifier, absolute);
			if (resolved && !seen.has(resolved)) queue.push(resolved);
		}
	}

	return sources.sort();
}

function contentHash(): string {
	const hash = createHash('sha256');
	for (const absolute of sourceClosure(CONTENT_SOURCES)) {
		hash.update(relative(APPS_ROOT, absolute));
		hash.update('\0');
		try {
			hash.update(readFileSync(absolute, 'utf8'));
		} catch {
			hash.update('<missing>');
		}
		hash.update('\0');
	}
	return hash.digest('hex').slice(0, 16);
}

function provenancePartial(): Partial<BenchProvenance> {
	return {
		commitSha: gitHeadSha(),
		treeDirty: gitTreeDirty(),
		contentHash: contentHash()
	};
}

function fixtureFor(tier: BenchTier) {
	if (tier === 'chopin') return chopinProject.layout;
	return buildScaleFixture(SCALE_FIXTURE_SEEDS[tier]);
}

function seedFor(tier: BenchTier): number | undefined {
	return tier === 'chopin' ? undefined : SCALE_FIXTURE_SEEDS[tier].seed;
}

function recordTier(tier: BenchTier): BenchTierResult {
	const fixture = fixtureFor(tier);
	const baseProvenance = makeNodeProvenance(provenancePartial());
	// One sampling config per tier, shared by the Node and browser runs so the
	// merged provenance block truthfully describes every sample it carries.
	const nodeOptions: NodeTierOptions = tier === 'large' ? LARGE_OPTIONS : DEFAULT_NODE_OPTIONS;
	const browserOptions: BrowserTierOptions = { warmup: nodeOptions.warmup, samples: nodeOptions.samples };
	// Visitor topology for the Chopin tier reflects the live scene: production
	// presentation tints + bespoke-room exclusion (6 rooms). Scale tiers stay on
	// the default visitor policy (no exclusions apply there).
	if (tier === 'chopin') browserOptions.policyFactory = chopinWallMeshRenderPolicyFactory();

	const node = measureNodeTier(fixture, tier, baseProvenance, nodeOptions, seedFor(tier));
	const browser = measureBrowserTier(fixture, tier, baseProvenance, browserOptions, seedFor(tier));

	return {
		tier,
		...(node.seed === undefined ? {} : { seed: node.seed }),
		roomCount: node.roomCount,
		provenance: node.provenance,
		samples: [...node.samples, ...browser.samples]
	};
}

/**
 * Record the Node + browser tiers. `full` (default false) includes the slow
 * 1,000-room `large` tier; the checked-in baseline is recorded with `--full`.
 */
export function recordBaseline(options: { full?: boolean } = {}): BudgetBaseline {
	const full = options.full ?? false;
	const tiers = full ? [...TIER_ORDER] : TIER_ORDER.filter((tier) => tier !== 'large');
	return {
		methodVersion: BENCH_METHOD_VERSION,
		budgets: BUDGETS,
		tiers: tiers.map(recordTier)
	};
}
