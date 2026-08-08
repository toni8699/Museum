import { materialById } from '$lib/content/materials';
import type {
	MaterialDefinition,
	MaterialId,
	MaterialTextureSlot
} from '$lib/types/materials';
import type {
	MuseumSceneDocument,
	SceneMaterialInstance,
	SceneTextureAsset
} from '$lib/content/scene';

const DEFAULT_TILE: [number, number] = [1, 1];
const SLOT_ORDER: MaterialTextureSlot[] = [
	'map',
	'normalMap',
	'roughnessMap',
	'aoMap',
	'metalnessMap'
];

// Static property access required — Vite's module runner rejects dynamic import.meta.env reads.
const isDevEnv = import.meta.env.DEV;

export type EffectiveSceneMaterial = {
	catalogue: MaterialId | null;
	slotUris: Partial<Record<MaterialTextureSlot, string>>;
	roughness: number;
	metalness: number;
	color: string;
	defaultTileSizeMeters: [number, number];
	variantSeed: string;
};

export type ResolveTarget = {
	materialInstanceId: string | null;
	fallbackCatalogueId: MaterialId;
};

function djb2(input: string): string {
	let hash = 5381;
	for (let i = 0; i < input.length; i += 1) {
		hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
	}
	return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

function findTexture(
	document: Pick<MuseumSceneDocument, 'textures'>,
	textureId: string | undefined
): SceneTextureAsset | undefined {
	if (!textureId) return undefined;
	return document.textures.find((texture) => texture.id === textureId);
}

/**
 * Pure resolver. Combines a material instance override (if any) on top of a
 * catalogue-PBR fallback. Deterministic output; no Three.js or document
 * mutation; safe to call inside Svelte $derived blocks.
 *
 * `variantSeed` is the cache key seed shared with texture-cache's variant pool
 * — two effective materials with identical (slotUris, roughness, metalness)
 * produce the same seed and therefore share the same variant.
 */
export function resolveSceneMaterial(
	document: Pick<MuseumSceneDocument, 'materials' | 'textures'>,
	target: ResolveTarget
): EffectiveSceneMaterial {
	const instance: SceneMaterialInstance | undefined = target.materialInstanceId
		? document.materials.find(
				(material) => material.id === target.materialInstanceId
			)
		: undefined;

	if (target.materialInstanceId && !instance && isDevEnv) {
		console.warn(
			`[scene-instance-material] Unknown materialInstanceId: ${target.materialInstanceId}`
		);
	}

	let catalogueId: MaterialId | null =
		instance?.baseMaterialId ?? target.fallbackCatalogueId;
	if (catalogueId && !materialById.has(catalogueId)) {
		catalogueId = null;
	}
	const catalogue: MaterialDefinition | undefined = catalogueId
		? materialById.get(catalogueId)
		: undefined;

	const slotUris: Partial<Record<MaterialTextureSlot, string>> = {
		...(catalogue?.textures ?? {})
	};
	if (instance?.baseTextureId) {
		const texture = findTexture(document, instance.baseTextureId);
		if (texture) slotUris.map = texture.uri;
		else if (isDevEnv) {
			console.warn(
				`[scene-instance-material] Unknown baseTextureId: ${instance.baseTextureId}`
			);
		}
	}

	const roughness = instance?.roughness ?? catalogue?.roughness ?? 0.5;
	const metalness = instance?.metalness ?? catalogue?.metalness ?? 0;
	const color = catalogue?.fallbackColor ?? '#c4b4a0';
	const defaultTileSizeMeters = catalogue?.defaultTileSizeMeters ?? DEFAULT_TILE;

	const sortedEntries = SLOT_ORDER.filter(
		(slot) => slotUris[slot] !== undefined
	)
		.map((slot) => `${slot}=${slotUris[slot]}`)
		.join('&');
	const variantSeed = `v${djb2(
		`${sortedEntries}|${Math.round(roughness * 1000)}|${Math.round(metalness * 1000)}`
	)}`;

	return {
		catalogue: catalogueId,
		slotUris,
		roughness,
		metalness,
		color,
		defaultTileSizeMeters,
		variantSeed
	};
}
