import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import {
	remapModelMaterials,
	releaseModelMaterialRemap
} from './instance-material-remap';
import { resetTextureCachesForTests } from '../materials/texture-cache';
import type { EffectiveSceneMaterial } from '../materials/scene-instance-material';
import type { Texture as ThreeTexture } from 'three';

vi.mock('three', async () => {
	const actual = await vi.importActual<typeof import('three')>('three');
	class MockTextureLoader {
		load(
			url: string,
			onLoad: (tex: ThreeTexture) => void,
			_onProgress: unknown,
			_onError: (e: unknown) => void
		): unknown {
			const tex: ThreeTexture = {
				source: { data: null },
				uuid: url,
				image: { complete: true } as HTMLImageElement,
				wrapS: 0,
				wrapT: 0,
				repeat: { set() {}, x: 1, y: 1 },
				rotation: 0,
				center: { set() {} },
				needsUpdate: false,
				clone(this: ThreeTexture) {
					return { ...this } as ThreeTexture;
				},
				dispose() {
					/* mock */
				}
			} as unknown as ThreeTexture;
			queueMicrotask(() => onLoad(tex));
			return;
		}
	}
	return { ...actual, TextureLoader: MockTextureLoader };
});

const effective: EffectiveSceneMaterial = {
	catalogue: 'plaster-warm',
	slotUris: { map: '/textures/x.png' },
	roughness: 0.92,
	metalness: 0.02,
	color: '#c4b4a0',
	defaultTileSizeMeters: [2, 2],
	variantSeed: 'vREMAP1'
};

describe('instance-material-remap', () => {
	beforeEach(() => {
		resetTextureCachesForTests();
	});

	it('replaces every mesh material with a fresh MeshStandardMaterial', () => {
		const group = new Group();
		const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
		const b = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
		group.add(a, b);

		const { acquiredKey } = remapModelMaterials(group, effective, [1, 1]);

		expect(acquiredKey.seed).toBe('vREMAP1');
		expect(acquiredKey.rx).toBe(1);
		expect(acquiredKey.ry).toBe(1);
		expect(acquiredKey.rot).toBe(0);
		for (const mesh of [a, b]) {
			expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
			expect((mesh.material as MeshStandardMaterial).userData['museumEffectiveSeed']).toBe(
				'vREMAP1'
			);
		}
	});

	it('does not mutate meshes outside the affected traversal', () => {
		const group = new Group();
		const target = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
		const skinned = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
		skinned.name = 'skinned';
		const lightHolder: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
		group.add(target, skinned, lightHolder);

		const beforeSeed = skinned.material['userData']?.['museumEffectiveSeed'];
		const beforeLight = lightHolder.material;

		remapModelMaterials(group, effective, [1, 1]);

		// All meshes get a fresh material under this branch.
		expect(skinned.material).toBeInstanceOf(MeshStandardMaterial);
		expect(lightHolder.material).toBeInstanceOf(MeshStandardMaterial);
		expect(beforeSeed).toBeUndefined();
		expect(beforeLight).not.toBe(lightHolder.material);
	});

	it('release after remap is idempotent', () => {
		const group = new Group();
		group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
		const key = remapModelMaterials(group, effective, [1, 1]).acquiredKey;

		releaseModelMaterialRemap(key);
		releaseModelMaterialRemap(key);
		releaseModelMaterialRemap(key);
	});
});
