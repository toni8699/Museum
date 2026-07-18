import { museumAssets, type MuseumAssetFilters } from '$lib/content/assets';
import type { AssetStatus, MuseumAsset } from '$lib/types/assets';

export type AssetLibraryStatusFilter = 'usable' | AssetStatus;

export type AssetLibraryFilters = Omit<MuseumAssetFilters, 'status'> & {
	status?: AssetLibraryStatusFilter;
};

/** Default editor browsing excludes rejected assets without changing the public manifest API. */
export function filterAssetLibraryItems(
	assets: readonly MuseumAsset[],
	filters: AssetLibraryFilters = {}
): MuseumAsset[] {
	const { status = 'usable', ...manifestFilters } = filters;
	const query = manifestFilters.query?.trim().toLocaleLowerCase() ?? '';
	return assets.filter((asset) => {
		if (manifestFilters.category && asset.category !== manifestFilters.category) return false;
		if (status === 'usable' ? asset.status === 'rejected' : asset.status !== status) return false;
		if (!query) return true;
		return [asset.id, asset.name, asset.category].some((value) =>
			value.toLocaleLowerCase().includes(query)
		);
	});
}

export function listAssetLibraryItems(filters: AssetLibraryFilters = {}): MuseumAsset[] {
	return filterAssetLibraryItems(museumAssets, filters);
}

/** Allocate base, then base-2, base-3, ... while reserving the returned ID immediately. */
export function reserveEntityId(base: string, reservedIds: Set<string>): string {
	let id = base;
	let suffix = 2;
	while (reservedIds.has(id)) {
		id = `${base}-${suffix}`;
		suffix += 1;
	}
	reservedIds.add(id);
	return id;
}
