import type { MaterialDefinition, MaterialId } from '$lib/types/materials';

export const museumMaterials: MaterialDefinition[] = [
  {
    id: 'plaster-warm',
    label: 'Warm Plaster',
    textures: {
      map: '/textures/plaster-warm/map.png',
      roughnessMap: '/textures/plaster-warm/roughness.png'
    },
    fallbackColor: '#c4b4a0',
    roughness: 0.92,
    metalness: 0.02,
    defaultTileSizeMeters: [2, 2]
  },
  {
    id: 'wood-walnut',
    label: 'Walnut Wood',
    textures: {
      map: '/textures/wood-walnut/map.png',
      roughnessMap: '/textures/wood-walnut/roughness.png'
    },
    fallbackColor: '#3d2a1a',
    roughness: 0.78,
    metalness: 0.04,
    defaultTileSizeMeters: [1.5, 1.5]
  },
  {
    id: 'brass-aged',
    label: 'Aged Brass',
    textures: {
      map: '/textures/brass-aged/map.png'
    },
    fallbackColor: '#d6b35f',
    roughness: 0.45,
    metalness: 0.85,
    defaultTileSizeMeters: [0.5, 0.5]
  },
  {
    id: 'marble-light',
    label: 'Light Marble',
    fallbackColor: '#e8e4dc',
    roughness: 0.35,
    metalness: 0.08,
    defaultTileSizeMeters: [1.2, 1.2]
  },
  {
    id: 'velvet-dark',
    label: 'Dark Velvet',
    fallbackColor: '#3a1822',
    roughness: 0.95,
    metalness: 0,
    defaultTileSizeMeters: [1, 1]
  },
  {
    id: 'paper-aged',
    label: 'Aged Paper',
    fallbackColor: '#e2d2b0',
    roughness: 0.9,
    metalness: 0,
    defaultTileSizeMeters: [0.4, 0.4]
  }
];

export const materialById = new Map<MaterialId, MaterialDefinition>(
  museumMaterials.map((material) => [material.id, material])
);

export function getMaterial(id: MaterialId): MaterialDefinition {
  const material = materialById.get(id);
  if (!material) throw new Error(`Unknown museum material: ${id}`);
  return material;
}

export function computeTextureRepeat(
  surfaceSize: [number, number],
  tileSize: [number, number] = [1, 1]
): [number, number] {
  const repeatX = Math.max(0.01, surfaceSize[0] / Math.max(0.01, tileSize[0]));
  const repeatY = Math.max(0.01, surfaceSize[1] / Math.max(0.01, tileSize[1]));
  return [repeatX, repeatY];
}
