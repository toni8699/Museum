import { describe, expect, it } from 'vitest';
import type {
	MuseumSceneDocument,
	SceneEntity,
	SceneLightEntity,
	SceneModelEntity,
	ScenePrimitiveEntity,
	SceneTextureAsset
} from '$lib/content/scene';
import {
	NEAR_INVISIBLE_OPACITY,
	type SelectionHitInfo
} from '$lib/editor/editor-selection';
import {
	TEXTURE_DRAG_MIME,
	filterTextureLibraryItems,
	firstRenderablePlacementId,
	materialInstanceUsageCount,
	orderRecentlyUsedTextures,
	reserveResourceId,
	resourceIdBase
} from '$lib/editor/editor-textures';

const textures: SceneTextureAsset[] = [
	{ id: 'wall', name: 'Wall Detail', uri: '/textures/wall.webp' },
	{ id: 'floor', name: 'Floor Grain', uri: '/textures/floor.png' }
];

const model: SceneModelEntity = {
	kind: 'model',
	id: 'model',
	name: 'Model',
	roomId: 'workshop',
	assetId: 'chair',
	fallback: 'chair',
	position: [0, 0, 0],
	rotation: [0, 0, 0],
	materialInstanceId: 'shared'
};

const primitive: ScenePrimitiveEntity = {
	kind: 'primitive',
	primitive: 'box',
	id: 'primitive',
	name: 'Primitive',
	roomId: 'workshop',
	position: [0, 0, 0],
	rotation: [0, 0, 0],
	dimensions: { width: 1, height: 1, depth: 1 },
	materialId: 'wood-walnut',
	castShadow: true,
	receiveShadow: true,
	materialInstanceId: 'shared'
};

const light: SceneLightEntity = {
	kind: 'light',
	light: 'point',
	id: 'light',
	name: 'Light',
	roomId: 'workshop',
	position: [0, 0, 0],
	rotation: [0, 0, 0],
	color: '#ffffff',
	intensity: 1,
	castShadow: false
};

function sceneDocument(entities: SceneEntity[]): MuseumSceneDocument {
	return {
		version: 6,
		textures: [],
		materials: [],
		entities,
		navigationNodes: [],
		connections: []
	};
}

function hit(opacity: number, placementId: string | null): SelectionHitInfo {
	return { opacity, placementId };
}

describe('editor texture helpers', () => {
	it('uses the exact custom drag MIME type', () => {
		expect(TEXTURE_DRAG_MIME).toBe('application/x-museum-texture');
	});

	it('searches texture names and URIs case-insensitively without mutating the source', () => {
		const sourceBefore = structuredClone(textures);

		expect(filterTextureLibraryItems(textures, 'DETAIL').map(({ id }) => id)).toEqual([
			'wall'
		]);
		expect(filterTextureLibraryItems(textures, 'FLOOR.PNG').map(({ id }) => id)).toEqual([
			'floor'
		]);
		expect(textures).toEqual(sourceBefore);
	});

	it('preserves document order for a blank texture query', () => {
		expect(filterTextureLibraryItems(textures, '   ').map(({ id }) => id)).toEqual([
			'wall',
			'floor'
		]);
	});

	it('normalizes resource slugs and uses the fallback when the value is empty', () => {
		expect(resourceIdBase('  Warm Stone / Detail  ', 'texture')).toBe('warm-stone-detail');
		expect(resourceIdBase('---', 'Imported Texture')).toBe('imported-texture');
	});

	it('reserves the smallest available numeric suffix without using -1', () => {
		expect(reserveResourceId('texture', [])).toBe('texture');
		expect(reserveResourceId('texture', ['texture', 'texture-3'])).toBe('texture-2');
		expect(reserveResourceId('texture', ['texture', 'texture-2'])).toBe('texture-3');
	});

	it('counts only model and primitive material-instance references', () => {
		const lightWithUnexpectedReference = {
			...light,
			materialInstanceId: 'shared'
		} as SceneEntity;
		const unrelatedModel = { ...model, id: 'other-model', materialInstanceId: 'other' };

		expect(
			materialInstanceUsageCount(
				sceneDocument([model, primitive, lightWithUnexpectedReference, unrelatedModel]),
				'shared'
			)
		).toBe(2);
	});

	it('orders valid recent textures first and preserves document order for the rest', () => {
		const moreTextures = [
			...textures,
			{ id: 'ceiling', name: 'Ceiling', uri: '/textures/ceiling.jpg' }
		];

		expect(
			orderRecentlyUsedTextures(moreTextures, [
				'floor',
				'stale',
				'floor',
				'ceiling'
			]).map(({ id }) => id)
		).toEqual(['floor', 'ceiling', 'wall']);
		expect(moreTextures.map(({ id }) => id)).toEqual(['wall', 'floor', 'ceiling']);
	});

	it('returns the first effective hit for a current model or primitive entity', () => {
		const hits = [
			hit(NEAR_INVISIBLE_OPACITY - 0.001, 'model'),
			hit(1, null),
			hit(1, 'stale'),
			hit(1, 'light'),
			hit(NEAR_INVISIBLE_OPACITY, 'primitive'),
			hit(1, 'model')
		];

		expect(firstRenderablePlacementId(hits, [model, primitive, light])).toBe('primitive');
	});

	it('rejects light-only placement hits', () => {
		expect(firstRenderablePlacementId([hit(1, 'light')], [light])).toBeNull();
	});

	it('rejects stale entity ids and empty hit lists', () => {
		expect(firstRenderablePlacementId([hit(1, 'stale-model')], [model, primitive])).toBeNull();
		expect(firstRenderablePlacementId([], [model, primitive])).toBeNull();
	});

	it('deduplicates naturally across nested placement hits', () => {
		// Two hits climbing the same placement resolve to one id; the first
		// renderable entity still wins regardless of duplicate visibility.
		const hits = [hit(1, 'model'), hit(1, 'model'), hit(1, 'primitive')];
		expect(firstRenderablePlacementId(hits, [model, primitive])).toBe('model');
	});
});
