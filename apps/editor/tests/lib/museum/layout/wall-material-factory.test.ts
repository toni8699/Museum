import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { getMaterial } from '$lib/content/materials';
import { createVisitorWallMaterialFactory } from '$lib/museum/layout/wall-material-factory';
import type { IndexedWallMesh } from '$lib/layout/wall-mesh-builder';

function meshFor(roomId: string): IndexedWallMesh {
	return { roomId } as IndexedWallMesh;
}

describe('createVisitorWallMaterialFactory', () => {
	it('resolves a plain-tint MeshStandardMaterial matching the textures="off" plaster-warm surface', () => {
		const { factory } = createVisitorWallMaterialFactory(() => '#1b1824');
		const resolved = factory('wall', meshFor('entrance'));

		expect(resolved.material).toBeInstanceOf(MeshStandardMaterial);
		const material = resolved.material as MeshStandardMaterial;
		expect(material.color.getHexString()).toBe('1b1824');
		expect(material.roughness).toBe(getMaterial('plaster-warm').roughness);
		expect(material.metalness).toBe(getMaterial('plaster-warm').metalness);
		// No texture maps: textures stay off in G4.
		expect(material.map).toBeNull();
		// No release lease: the factory owns the cache, not the adapter.
		expect(resolved.release).toBeUndefined();
	});

	it('caches one material per distinct tint and reuses it across rooms', () => {
		const tints = new Map<string, string>([
			['room-a', '#111111'],
			['room-b', '#222222']
		]);
		const { factory } = createVisitorWallMaterialFactory((roomId) => tints.get(roomId) ?? '#000000');

		const a1 = factory('wall', meshFor('room-a')).material;
		const a2 = factory('lintel', meshFor('room-a')).material;
		const b1 = factory('wall', meshFor('room-b')).material;

		expect(a1).toBe(a2);
		expect(a1).not.toBe(b1);
	});

	it('dispose() disposes cached materials once and clears the cache', () => {
		const { factory, dispose } = createVisitorWallMaterialFactory(() => '#1b1824');
		const material = factory('wall', meshFor('entrance')).material;
		const disposeSpy = vi.spyOn(material, 'dispose');

		dispose();
		expect(disposeSpy).toHaveBeenCalledTimes(1);

		// Cache cleared: the next resolve allocates a fresh material.
		const after = factory('wall', meshFor('entrance')).material;
		expect(after).not.toBe(material);
	});
});
