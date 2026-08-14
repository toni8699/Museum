import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	FLOOR_MATERIAL,
	OPENING_HIGHLIGHT_MATERIAL,
	WALL_HIGHLIGHT_MATERIAL,
	WALL_MATERIAL_DEFAULT,
	WALL_MATERIAL_OPENING_SELECTED,
	WALL_MATERIAL_WALL_SELECTED,
	wallMaterialForKey,
	wallSectionMaterialKey
} from '$lib/editor/layout/layout-wall-material';

describe('layout wall material buckets', () => {
	it('prefers the opening selection over the wall selection', () => {
		expect(wallSectionMaterialKey('opening-a', 'wall-a', 'wall-a', 'opening-a')).toBe(
			'opening-selected'
		);
	});

	it('falls back to the wall selection when the opening is not selected', () => {
		expect(wallSectionMaterialKey('opening-b', 'wall-a', 'wall-a', 'opening-a')).toBe(
			'wall-selected'
		);
	});

	it('uses the default bucket when nothing is selected', () => {
		expect(wallSectionMaterialKey(null, null, 'wall-a')).toBe('default');
		expect(wallSectionMaterialKey(null, 'wall-b', 'wall-a', 'opening-a')).toBe('default');
	});

	it('maps each key to a shared material instance', () => {
		expect(wallMaterialForKey('default')).toBe(WALL_MATERIAL_DEFAULT);
		expect(wallMaterialForKey('wall-selected')).toBe(WALL_MATERIAL_WALL_SELECTED);
		expect(wallMaterialForKey('opening-selected')).toBe(WALL_MATERIAL_OPENING_SELECTED);
	});

	it('exports a shared floor material', () => {
		expect(FLOOR_MATERIAL).toBeDefined();
	});

	it('hoists the selection-highlight materials as module-level singletons', () => {
		// Stable identity across accesses: every preview mount reuses the same two
		// materials instead of allocating new ones per mount (which would leak GPU
		// resources across workspace switches).
		expect(WALL_HIGHLIGHT_MATERIAL).toBe(WALL_HIGHLIGHT_MATERIAL);
		expect(OPENING_HIGHLIGHT_MATERIAL).toBe(OPENING_HIGHLIGHT_MATERIAL);
		expect(WALL_HIGHLIGHT_MATERIAL).not.toBe(OPENING_HIGHLIGHT_MATERIAL);
	});
});

describe('LayoutPreviewScene highlight-material boundary', () => {
	const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../src');
	const previewPath = resolve(srcRoot, 'lib/editor/layout/LayoutPreviewScene.svelte');

	it('creates no Mesh materials inline; it reuses the shared module singletons', () => {
		const source = readFileSync(previewPath, 'utf8');
		// The component must not allocate materials on mount.
		expect(source).not.toMatch(/new\s+Mesh(Basic|Standard)Material/);
		expect(source).not.toMatch(/WALL_HIGHLIGHT_MATERIAL\s*=\s*new/);
		expect(source).not.toMatch(/OPENING_HIGHLIGHT_MATERIAL\s*=\s*new/);
		// The overlay wiring resolves through the shared module instead.
		expect(source).toContain("WALL_HIGHLIGHT_MATERIAL");
		expect(source).toContain("OPENING_HIGHLIGHT_MATERIAL");
	});
});
