import { Box3, Mesh, Vector3, type Material, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetMetrics } from '$lib/types/assets';

function materialsFor(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export function cloneModelScene(
  source: Object3D,
  castShadow: boolean,
  receiveShadow: boolean
): Object3D {
  const instance = clone(source);
  const materialClones = new Map<Material, Material>();

  const cloneMaterial = (material: Material) => {
    const existing = materialClones.get(material);
    if (existing) return existing;
    const materialClone = material.clone();
    materialClones.set(material, materialClone);
    return materialClone;
  };

  instance.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  return instance;
}

export function setModelWireframe(scene: Object3D, wireframe: boolean) {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of materialsFor(object)) {
      if (!('wireframe' in material)) continue;
      (material as Material & { wireframe: boolean }).wireframe = wireframe;
      material.needsUpdate = true;
    }
  });
}

export function inspectModel(scene: Object3D, animationNames: string[]): {
  bounds: Box3;
  metrics: AssetMetrics;
} {
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const dimensions = bounds.getSize(new Vector3());
  const materials = new Set<string>();
  let meshCount = 0;
  let triangleCount = 0;

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    for (const material of materialsFor(object)) materials.add(material.uuid);

    const indexCount = object.geometry.index?.count;
    const positionCount = object.geometry.getAttribute('position')?.count ?? 0;
    triangleCount += Math.floor((indexCount ?? positionCount) / 3);
  });

  return {
    bounds,
    metrics: {
      dimensions: [dimensions.x, dimensions.y, dimensions.z],
      meshCount,
      materialCount: materials.size,
      triangleCount,
      animationNames
    }
  };
}

export function disposeModelInstance(scene: Object3D) {
  const materials = new Set<Material>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of materialsFor(object)) materials.add(material);
  });

  for (const material of materials) material.dispose();
}
