import { describe, expect, it } from 'vitest';
import { museumAssets } from '$lib/content/assets';
import { filterAssetLibraryItems, reserveEntityId } from '$lib/editor/editor-assets';

describe('asset library filters', () => {
	const approved = { ...museumAssets[0], id: 'approved', status: 'approved' as const };
	const rejected = { ...museumAssets[1], id: 'rejected', status: 'rejected' as const };

	it('hides rejected assets by default and isolates an explicit rejected filter', () => {
		expect(filterAssetLibraryItems([approved, rejected]).map((asset) => asset.id)).toEqual([
			'approved'
		]);
		expect(
			filterAssetLibraryItems([approved, rejected], { status: 'rejected' }).map(
				(asset) => asset.id
			)
		).toEqual(['rejected']);
	});

	it('combines query and category filters without changing source order', () => {
		const results = filterAssetLibraryItems([approved, rejected], {
			query: 'PIANO',
			category: 'piano',
			status: 'approved'
		});
		expect(results.map((asset) => asset.id)).toEqual(['approved']);
	});
});

describe('reserveEntityId', () => {
	it('reserves base then numeric suffixes with no -1', () => {
		const reserved = new Set<string>();
		expect(reserveEntityId('chair-placement', reserved)).toBe('chair-placement');
		expect(reserveEntityId('chair-placement', reserved)).toBe('chair-placement-2');
		expect(reserveEntityId('chair-placement', reserved)).toBe('chair-placement-3');
	});
});
