import type {
	SceneDocument,
	SceneEntity,
	SceneTextureAsset
} from '$lib/content/scene';
import {
	NEAR_INVISIBLE_OPACITY,
	type SelectionHitInfo
} from './editor-selection';

export const TEXTURE_DRAG_MIME = 'application/x-editor-texture';

export type {
	MaterialShareMode,
	MaterialInstancePatch,
	MaterialEditDecision
} from './editor-types';

export function filterTextureLibraryItems(
	textures: readonly SceneTextureAsset[],
	query: string
): SceneTextureAsset[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	return textures.filter((texture) => {
		if (!normalizedQuery) return true;
		return [texture.name, texture.uri].some((value) =>
			value.toLocaleLowerCase().includes(normalizedQuery)
		);
	});
}

function slug(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function resourceIdBase(value: string, fallback: string): string {
	return slug(value) || slug(fallback);
}

export function reserveResourceId(base: string, ids: Iterable<string>): string {
	const reservedIds = new Set(ids);
	if (!reservedIds.has(base)) return base;

	let suffix = 2;
	while (reservedIds.has(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
}

export function materialInstanceUsageCount(
	document: SceneDocument,
	materialInstanceId: string
): number {
	return document.entities.filter(
		(entity) =>
			(entity.kind === 'model' || entity.kind === 'primitive') &&
			entity.materialInstanceId === materialInstanceId
	).length;
}

export function orderRecentlyUsedTextures(
	textures: readonly SceneTextureAsset[],
	recentIds: readonly string[]
): SceneTextureAsset[] {
	const textureById = new Map(textures.map((texture) => [texture.id, texture]));
	const seen = new Set<string>();
	const ordered: SceneTextureAsset[] = [];

	for (const id of recentIds) {
		const texture = textureById.get(id);
		if (!texture || seen.has(id)) continue;
		seen.add(id);
		ordered.push(texture);
	}

	for (const texture of textures) {
		if (seen.has(texture.id)) continue;
		seen.add(texture.id);
		ordered.push(texture);
	}

	return ordered;
}

export function firstRenderablePlacementId(
	hits: readonly SelectionHitInfo[],
	entities: readonly SceneEntity[]
): string | null {
	const renderableIds = new Set(
		entities
			.filter((entity) => entity.kind === 'model' || entity.kind === 'primitive')
			.map((entity) => entity.id)
	);

	for (const hit of hits) {
		if (
			hit.opacity >= NEAR_INVISIBLE_OPACITY &&
			hit.placementId &&
			renderableIds.has(hit.placementId)
		) {
			return hit.placementId;
		}
	}

	return null;
}
