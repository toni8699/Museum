import { MeshStandardMaterial, type Material } from 'three';
import { getMaterial } from '$lib/content/materials';
import type { WallMeshMaterialFactory } from '$lib/render/wall-geometry-adapter';

/**
 * Imperative visitor wall-material factory. Reproduces the `textures="off"`
 * plain-tint wall surface that `LayoutMuseumShell` renders today: `plaster-warm`
 * roughness/metalness + the room's `ChopinRoomPresentation` tint, with no
 * texture maps. Materials are cached per distinct tint so all rooms sharing a
 * tint render through one program with only `color` differing.
 *
 * Textures stay off in G4 (pixel parity). Tile repeat is a material-side
 * concern that applies only once textures turn on — the builder emits raw
 * metric UVs and this factory owns no repeat today.
 *
 * The returned `factory` deliberately omits `release` on every resolved
 * material: the cache is owned by this closure, so the adapter must not
 * dispose shared entries. `dispose()` frees the cache when the shell unmounts.
 */
export function createVisitorWallMaterialFactory(resolveTint: (roomId: string) => string): {
	factory: WallMeshMaterialFactory;
	dispose: () => void;
} {
	const definition = getMaterial('plaster-warm');
	const cache = new Map<string, Material>();

	function materialForTint(tint: string): Material {
		let material = cache.get(tint);
		if (!material) {
			material = new MeshStandardMaterial({
				color: tint,
				roughness: definition.roughness,
				metalness: definition.metalness
			});
			cache.set(tint, material);
		}
		return material;
	}

	const factory: WallMeshMaterialFactory = (_surfaceKey, mesh) => {
		// No `release` lease: shared cache entries are disposed only by `dispose`.
		return { material: materialForTint(resolveTint(mesh.roomId)) };
	};

	return {
		factory,
		dispose: () => {
			for (const material of cache.values()) material.dispose();
			cache.clear();
		}
	};
}
