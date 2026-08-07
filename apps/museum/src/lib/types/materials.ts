export type MaterialId =
  | 'plaster-warm'
  | 'wood-walnut'
  | 'brass-aged'
  | 'marble-light'
  | 'velvet-dark'
  | 'paper-aged';

export type MaterialTextureSlot =
  | 'map'
  | 'normalMap'
  | 'roughnessMap'
  | 'aoMap'
  | 'metalnessMap';

export type MaterialTextures = Partial<Record<MaterialTextureSlot, string>>;

export type MaterialDefinition = {
  id: MaterialId;
  label: string;
  textures?: MaterialTextures;
  fallbackColor: string;
  roughness: number;
  metalness: number;
  normalScale?: [number, number];
  /** Physical size of one texture tile in meters [width, height]. */
  defaultTileSizeMeters?: [number, number];
};

export type MaterialTextureMode = 'auto' | 'off';

export type MaterialLoadStatus =
	| 'idle'
	| 'loading'
	| 'ready'
	| 'partial'
	| 'failed'
	| 'fallback';

export type Vec2 = [number, number];
