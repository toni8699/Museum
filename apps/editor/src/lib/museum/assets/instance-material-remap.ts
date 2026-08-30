import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { acquireEffectiveVariant, releaseEffectiveVariant } from '../materials/texture-cache';
import type { EffectiveSceneMaterial } from '../materials/scene-instance-material';

export type RemapKey = { seed: string; rx: number; ry: number; rot: number };

/**
 * Replaces every Mesh's material in `scene` with a fresh `MeshStandardMaterial`
 * populated from `effective` and the shared cache. Each fresh material
 * references the same ref-counted texture maps; one acquire per call, one
 * release. The userData['museumEffectiveSeed'] is set for diagnostic.
 */
export function remapModelMaterials(
	scene: Object3D,
	effective: EffectiveSceneMaterial,
	repeat: [number, number]
): { acquiredKey: RemapKey } {
	const [rx, ry] = repeat;
	const maps = acquireEffectiveVariant(effective, rx, ry, 0);

	scene.traverse((object) => {
		if (!(object instanceof Mesh)) return;
		const params: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
			color: effective.color,
			roughness: effective.roughness,
			metalness: effective.metalness
		};
		if (maps.map) params.map = maps.map;
		if (maps.normalMap) params.normalMap = maps.normalMap;
		if (maps.roughnessMap) params.roughnessMap = maps.roughnessMap;
		if (maps.aoMap) params.aoMap = maps.aoMap;
		if (maps.metalnessMap) params.metalnessMap = maps.metalnessMap;
		const material = new MeshStandardMaterial(params);
		material.userData['museumEffectiveSeed'] = effective.variantSeed;
		object.material = material;
	});

	return {
		acquiredKey: { seed: effective.variantSeed, rx, ry, rot: 0 }
	};
}

export function releaseModelMaterialRemap(key: RemapKey): void {
	releaseEffectiveVariant(key.seed, key.rx, key.ry, key.rot);
}
