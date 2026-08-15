import { describe, expect, it } from 'vitest';
import {
	EditorMaterialResourceMutator,
	type EditorMaterialResourceMutatorHost
} from '$lib/editor/store/material-resource-mutator.svelte';
import type {
	MuseumSceneDocument,
	SceneEntity,
	SceneMaterialInstance,
	SceneModelEntity,
	ScenePrimitiveEntity,
	SceneTextureAsset
} from '$lib/content/scene';
import type { AssetId, FallbackKind } from '$lib/types/assets';

interface HostRig extends EditorMaterialResourceMutatorHost {
	beginCalls: number;
	commitCalls: number;
	cancelCalls: number;
	commitResult: boolean;
	recents: string[];
}

function baseDocument(): MuseumSceneDocument {
	return {
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [],
		connections: []
	};
}

function rig(options: {
	document?: MuseumSceneDocument;
	blocked?: boolean;
	active?: boolean;
	commitResult?: boolean;
} = {}): HostRig {
	const blocked = options.blocked ?? false;
	const active = options.active ?? false;
	const commitResult = options.commitResult ?? true;
	const recents: string[] = [];
	let doc: MuseumSceneDocument = options.document ?? baseDocument();
	const rig: HostRig = {
		get isDocumentMutationBlocked() {
			return blocked;
		},
		get isEditorInteractionActive() {
			return active;
		},
		get document() {
			return doc;
		},
		set document(next: MuseumSceneDocument) {
			doc = next;
		},
		setStatusMessage: () => undefined,
		beginDocumentTransaction() {
			this.beginCalls += 1;
			return true;
		},
		commitDocumentTransaction() {
			this.commitCalls += 1;
			return commitResult;
		},
		cancelDocumentTransaction() {
			this.cancelCalls += 1;
			return true;
		},
		markTextureRecentlyUsed(textureId: string) {
			recents.unshift(textureId);
		},
		beginCalls: 0,
		commitCalls: 0,
		cancelCalls: 0,
		commitResult,
		recents
	};
	return rig;
}

function modelEntity(overrides: Partial<SceneModelEntity> = {}): SceneModelEntity {
	return {
		kind: 'model',
		id: 'm-1',
		name: 'Sofa',
		roomId: 'workshop',
		assetId: 'sofa-03' as AssetId,
		fallback: 'sofa-03' as FallbackKind,
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		...overrides
	};
}

type BoxPrimitiveEntity = ScenePrimitiveEntity & {
	primitive: 'box';
	dimensions: { width: number; height: number; depth: number };
};

function primitiveEntity(
	overrides: Partial<BoxPrimitiveEntity> = {}
): BoxPrimitiveEntity {
	return {
		kind: 'primitive',
		primitive: 'box',
		id: 'p-1',
		name: 'Box',
		roomId: 'workshop',
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		dimensions: { width: 1, height: 1, depth: 1 },
		materialId: 'wood-walnut',
		castShadow: true,
		receiveShadow: true,
		...overrides
	};
}

function lightEntity(): SceneEntity {
	return {
		kind: 'light',
		light: 'point',
		id: 'l-1',
		name: 'Light',
		roomId: 'workshop',
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		color: '#ffffff',
		intensity: 1,
		castShadow: false
	};
}

function texture(overrides: Partial<SceneTextureAsset> = {}): SceneTextureAsset {
	return {
		id: 't-1',
		name: 'Wall Detail',
		uri: '/textures/wall.webp',
		...overrides
	};
}

function material(overrides: Partial<SceneMaterialInstance> = {}): SceneMaterialInstance {
	return {
		id: 'mat-1',
		name: 'Sofa Material',
		baseMaterialId: 'wood-walnut',
		...overrides
	};
}

function documentOf(
	textures: SceneTextureAsset[],
	materials: SceneMaterialInstance[],
	entities: SceneEntity[]
): MuseumSceneDocument {
	return {
		textures,
		materials,
		entities,
		navigationNodes: [],
		connections: []
	};
}

describe('EditorMaterialResourceMutator — texture registration', () => {
	it('creates a texture asset and commits one transaction on success', () => {
		const host = rig();
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Wall Plaster', '/museum/wall.webp');

		expect(result).toEqual({
			status: 'created',
			textureId: 'wall-plaster'
		});
		expect(host.document.textures).toHaveLength(1);
		expect(host.document.textures[0]).toMatchObject({
			name: 'Wall Plaster',
			uri: '/museum/wall.webp'
		});
		expect(host.beginCalls).toBe(1);
		expect(host.commitCalls).toBe(1);
		expect(host.recents[0]).toBe('wall-plaster');
	});

	it('returns existing for the exact trimmed URI without touching transactions', () => {
		const document = documentOf([texture()], [], [modelEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Wall Plaster', '/textures/wall.webp');

		expect(result).toEqual({ status: 'existing', textureId: 't-1' });
		expect(host.beginCalls).toBe(0);
		expect(host.commitCalls).toBe(0);
		expect(host.recents[0]).toBe('t-1');
	});

	it('rejects unsafe URI without transactions or status', () => {
		const host = rig();
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Bad', 'http://example.com/x.png');

		expect(result.status).toBe('rejected');
		expect(host.beginCalls).toBe(0);
		expect(host.commitCalls).toBe(0);
	});

	it('rejects when document mutation is blocked', () => {
		const host = rig({ blocked: true });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Wall', '/textures/wall2.webp');

		expect(result.status).toBe('rejected');
		expect(host.beginCalls).toBe(0);
	});

	it('reserves the smallest available numeric suffix on collision', () => {
		const document = documentOf(
			[
				texture({ id: 'wall', name: 'Wall', uri: '/textures/wall-a.webp' }),
				texture({ id: 'wall-3', name: 'Wall 3', uri: '/textures/wall-3.webp' })
			],
			[],
			[]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Wall', '/textures/wall-b.webp');

		expect(result).toMatchObject({ status: 'created', textureId: 'wall-2' });
	});

	it('falls back to URI filename slug, then "texture", for ID generation', () => {
		const host = rig();
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('Dust', '/textures/plaster.png');

		// explicit name; slug is 'dust'
		expect(result.status).toBe('created');
		if (result.status === 'created') {
			expect(result.textureId).toBe('dust');
		}

		const second = mutator.registerVerifiedTexture('Dust', '/textures/plaster.png');
		// duplicate URI -> existing reuse
		expect(second.status).toBe('existing');
	});

	it('uses the bare slug "texture" when both name and filename slugify to empty', () => {
		const host = rig();
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.registerVerifiedTexture('----', '/museum/---');

		expect(result.status).toBe('created');
		if (result.status === 'created') {
			expect(result.textureId).toBe('texture');
		}
	});
});

describe('EditorMaterialResourceMutator — material patch', () => {
	it('primitive first assignment derives baseMaterialId from catalogue', () => {
		const document = documentOf([texture()], [], [primitiveEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-1' });

		expect(result.status).toBe('committed');
		if (result.status === 'committed') {
			expect(result.materialInstanceId).toBe('p-1-material');
			expect(result.textureId).toBe('t-1');
		}
		expect(host.document.materials).toHaveLength(1);
		expect(host.document.materials[0]).toMatchObject({
			id: 'p-1-material',
			baseMaterialId: 'wood-walnut',
			baseTextureId: 't-1'
		});
		const entity = host.document.entities[0] as ScenePrimitiveEntity;
		expect(entity.materialInstanceId).toBe('p-1-material');
	});

	it('model first assignment returns decision-required until base is supplied', () => {
		const document = documentOf([texture()], [], [modelEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const first = mutator.applyMaterialPatch('m-1', { baseTextureId: 't-1' });

		expect(first).toMatchObject({
			status: 'decision-required',
			needsBaseMaterial: true,
			sharedMaterialInstanceId: null
		});
		expect(host.beginCalls).toBe(0);

		const second = mutator.applyMaterialPatch(
			'm-1',
			{ baseTextureId: 't-1' },
			{ baseMaterialId: 'plaster-warm' }
		);
		expect(second.status).toBe('committed');
		expect(host.beginCalls).toBe(1);
	});

	it('updates an unshared instance in place', () => {
		const document = documentOf(
			[texture()],
			[material()],
			[primitiveEntity({ materialInstanceId: 'mat-1' })]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-1' });

		expect(result.status).toBe('committed');
		expect(host.document.materials).toHaveLength(1);
		const mat = host.document.materials[0]!;
		expect(mat.baseTextureId).toBe('t-1');
		expect(mat.id).toBe('mat-1');
	});

	it('shared instance returns decision-required', () => {
		const document = documentOf(
			[texture()],
			[material({ id: 'shared' })],
			[
				primitiveEntity({ id: 'p-1', materialInstanceId: 'shared' }),
				primitiveEntity({ id: 'p-2', materialInstanceId: 'shared' })
			]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-1' });

		expect(result).toMatchObject({
			status: 'decision-required',
			needsBaseMaterial: false,
			sharedMaterialInstanceId: 'shared'
		});
		expect(host.beginCalls).toBe(0);
	});

	it('make-unique clones once and repoints only the target entity', () => {
		const document = documentOf(
			[texture({ id: 't-1', uri: '/textures/wall.webp' }), texture({ id: 't-2', uri: '/textures/new.webp' })],
			[material({ id: 'shared' })],
			[
				primitiveEntity({ id: 'p-1', materialInstanceId: 'shared' }),
				primitiveEntity({ id: 'p-2', materialInstanceId: 'shared' })
			]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-2' }, {
			shareMode: 'make-unique'
		});

		expect(result.status).toBe('committed');
		if (result.status === 'committed') {
			expect(result.materialInstanceId).toBe('shared-copy');
		}
		expect(host.document.materials).toHaveLength(2);
		const p1 = host.document.entities[0] as ScenePrimitiveEntity;
		const p2 = host.document.entities[1] as ScenePrimitiveEntity;
		expect(p1.materialInstanceId).toBe('shared-copy');
		expect(p2.materialInstanceId).toBe('shared');
	});

	it('edit-shared updates the existing instance and affects every consumer', () => {
		const document = documentOf(
			[texture()],
			[material({ id: 'shared' })],
			[
				primitiveEntity({ id: 'p-1', materialInstanceId: 'shared' }),
				primitiveEntity({ id: 'p-2', materialInstanceId: 'shared' })
			]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-1' }, {
			shareMode: 'edit-shared'
		});

		expect(result.status).toBe('committed');
		expect(host.document.materials).toHaveLength(1);
		const mat = host.document.materials[0]!;
		expect(mat.baseTextureId).toBe('t-1');
	});

	it('rejects lights', () => {
		const document = documentOf([], [], [lightEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('l-1', { baseTextureId: 't-1' });

		expect(result.status).toBe('rejected');
	});

	it('rejects unknown texture id', () => {
		const document = documentOf([texture()], [], [primitiveEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-bogus' });

		expect(result.status).toBe('rejected');
		expect(host.beginCalls).toBe(0);
	});

	it('rejects roughness outside [0, 1]', () => {
		const document = documentOf(
			[texture()],
			[material()],
			[primitiveEntity({ materialInstanceId: 'mat-1' })]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { roughness: 2 });

		expect(result.status).toBe('rejected');
	});

	it('null removes an override on an existing instance', () => {
		const document = documentOf(
			[texture({ id: 't-1', uri: '/textures/wall.webp' })],
			[material({ id: 'mat-1', baseTextureId: 't-1', roughness: 0.5 })],
			[primitiveEntity({ materialInstanceId: 'mat-1' })]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { roughness: null });

		expect(result.status).toBe('committed');
		const mat = host.document.materials[0]!;
		expect(mat.roughness).toBeUndefined();
		expect(mat.baseTextureId).toBe('t-1');
	});

	it('rejects deliberately empty patches as no-ops', () => {
		const document = documentOf(
			[texture()],
			[material({ id: 'mat-1', baseTextureId: 't-1' })],
			[primitiveEntity({ materialInstanceId: 'mat-1' })]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', {});

		expect(result.status).toBe('rejected');
		expect(host.beginCalls).toBe(0);
	});

	it('rejects commits when blocked', () => {
		const document = documentOf([texture()], [], [primitiveEntity()]);
		const host = rig({ blocked: true, document });
		const mutator = new EditorMaterialResourceMutator(host);
		const result = mutator.applyMaterialPatch('p-1', { baseTextureId: 't-1' });

		expect(result.status).toBe('rejected');
	});
});

describe('EditorMaterialResourceMutator — makeMaterialInstanceUnique', () => {
	it('clones once when usage > 1', () => {
		const document = documentOf(
			[texture()],
			[material({ id: 'mat-1', baseTextureId: 't-1' })],
			[
				primitiveEntity({ id: 'p-1', materialInstanceId: 'mat-1' }),
				primitiveEntity({ id: 'p-2', materialInstanceId: 'mat-1' })
			]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const ok = mutator.makeMaterialInstanceUnique('p-1');

		expect(ok).toBe(true);
		expect(host.document.materials).toHaveLength(2);
		const p1 = host.document.entities[0] as ScenePrimitiveEntity;
		const p2 = host.document.entities[1] as ScenePrimitiveEntity;
		expect(p1.materialInstanceId).toBe('mat-1-copy');
		expect(p2.materialInstanceId).toBe('mat-1');
		expect(host.beginCalls).toBe(1);
		expect(host.commitCalls).toBe(1);
	});

	it('no-ops when the instance is already unique', () => {
		const document = documentOf(
			[],
			[material({ id: 'mat-1' })],
			[primitiveEntity({ id: 'p-1', materialInstanceId: 'mat-1' })]
		);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);
		const ok = mutator.makeMaterialInstanceUnique('p-1');

		expect(ok).toBe(false);
		expect(host.document.materials).toHaveLength(1);
		expect(host.beginCalls).toBe(0);
	});

	it('rejects unknown entity or lights', () => {
		const document = documentOf([], [], [lightEntity()]);
		const host = rig({ document });
		const mutator = new EditorMaterialResourceMutator(host);

		expect(mutator.makeMaterialInstanceUnique('l-1')).toBe(false);
		expect(mutator.makeMaterialInstanceUnique('missing')).toBe(false);
		expect(host.beginCalls).toBe(0);
	});
});
