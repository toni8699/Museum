import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../src');
const shellPath = resolve(srcRoot, 'lib/museum/layout/LayoutMuseumShell.svelte');
const factoryPath = resolve(srcRoot, 'lib/museum/layout/wall-material-factory.ts');

describe('G4 visitor shell boundary', () => {
	it('removes the per-span chord-box wall path in favor of the builder + adapter', () => {
		const source = readFileSync(shellPath, 'utf8');
		// The old loop iterated `wall.solidSpans` and built a `T.BoxGeometry` per span.
		expect(source).not.toContain('solidSpans');
		// The new path builds one room wall mesh and wraps it through the adapter.
		expect(source).toContain('buildRoomWallMesh');
		expect(source).toContain('toWallBufferGeometry');
		expect(source).toContain('createVisitorWallMaterialFactory');
		// Door portals and floor/ceiling ShapeGeometry stay.
		expect(source).toContain('RoomPortal');
		expect(source).toContain('ShapeGeometry');
	});

	it('keeps the visitor wall-material factory free of editor imports', () => {
		const source = readFileSync(factoryPath, 'utf8');
		expect(source).not.toMatch(/from\s+['"]\$lib\/editor/);
		expect(source).not.toMatch(/from\s+['"]svelte['"]/);
	});

	it('renders an explicit failure surface rather than silently omitting a room', () => {
		const source = readFileSync(shellPath, 'utf8');
		expect(source).toContain('LayoutWallFailure');
		expect(source).toContain('ok === false');
	});

	it('filters bespoke rooms BEFORE buildRoomWallMesh, matching the topology estimator', () => {
		const source = readFileSync(shellPath, 'utf8');
		// The excluded-room predicate must gate the build loop itself, not only
		// hide the rendered group — otherwise the live scene still pays the build
		// cost and diverges from estimateWallMeshTopology's exclusion semantics.
		// `lastIndexOf` resolves to the build CALL (the first occurrence is the import).
		const buildIndex = source.lastIndexOf('buildRoomWallMesh');
		const filterIndex = source.indexOf('.filter((room) => !excludedRoomIds.includes(room.roomId))');
		expect(buildIndex).toBeGreaterThan(0);
		expect(filterIndex).toBeGreaterThan(0);
		expect(filterIndex).toBeLessThan(buildIndex);
	});
});
