import { describe, expect, it } from 'vitest';
import {
	FLOOR_MATERIAL,
	WALL_MATERIAL_DEFAULT,
	WALL_MATERIAL_OPENING_SELECTED,
	WALL_MATERIAL_WALL_SELECTED,
	wallMaterialForKey,
	wallSectionMaterialKey
} from './layout-wall-material';

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
});
