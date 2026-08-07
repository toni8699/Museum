import { describe, expect, it, vi } from 'vitest';
import { resolveSceneMaterial } from './scene-instance-material';
import type { MuseumSceneDocument } from '$lib/content/scene';

const WALL_TEXTURE = { id: 'wall-detail', name: 'Wall Detail', uri: '/textures/wall-detail.webp' };
const FLOOR_TEXTURE = { id: 'floor-grain', name: 'Floor Grain', uri: '/textures/floor-grain.png' };

function doc(
	materials: MuseumSceneDocument['materials'],
	textures: MuseumSceneDocument['textures'] = [WALL_TEXTURE, FLOOR_TEXTURE]
): Pick<MuseumSceneDocument, 'materials' | 'textures'> {
	return { materials, textures };
}

describe('resolveSceneMaterial', () => {
	it('returns catalogue slot URIs when no instance is set', () => {
		const result = resolveSceneMaterial(doc([]), {
			materialInstanceId: null,
			fallbackCatalogueId: 'plaster-warm'
		});

		expect(result.catalogue).toBe('plaster-warm');
		expect(result.slotUris.map).toBe('/textures/plaster-warm/map.png');
		expect(result.slotUris.roughnessMap).toBe('/textures/plaster-warm/roughness.png');
		expect(result.roughness).toBe(0.92);
		expect(result.metalness).toBe(0.02);
		expect(result.color).toBe('#c4b4a0');
		expect(result.defaultTileSizeMeters).toEqual([2, 2]);
	});

	it('replaces the map slot when an instance supplies a baseTextureId', () => {
		const result = resolveSceneMaterial(
			doc([
				{
					id: 'wall-material',
					name: 'Wall Material',
					baseMaterialId: 'plaster-warm',
					baseTextureId: 'wall-detail'
				}
			]),
			{ materialInstanceId: 'wall-material', fallbackCatalogueId: 'plaster-warm' }
		);

		expect(result.slotUris.map).toBe('/textures/wall-detail.webp');
		expect(result.slotUris.roughnessMap).toBe('/textures/plaster-warm/roughness.png');
	});

	it('falls back to catalogue map when baseTextureId is unknown (with dev warn)', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const result = resolveSceneMaterial(
			doc([
				{
					id: 'wall-material',
					name: 'Wall Material',
					baseMaterialId: 'plaster-warm',
					baseTextureId: 'nonexistent'
				}
			]),
			{ materialInstanceId: 'wall-material', fallbackCatalogueId: 'plaster-warm' }
		);

		expect(result.slotUris.map).toBe('/textures/plaster-warm/map.png');
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('uses instance overrides for roughness and metalness when set', () => {
		const result = resolveSceneMaterial(
			doc([
				{
					id: 'm',
					name: 'M',
					baseMaterialId: 'plaster-warm',
					roughness: 0.35,
					metalness: 0.6
				}
			]),
			{ materialInstanceId: 'm', fallbackCatalogueId: 'plaster-warm' }
		);

		expect(result.roughness).toBe(0.35);
		expect(result.metalness).toBe(0.6);
	});

	it('uses unknown materialInstanceId without override (with dev warn)', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const result = resolveSceneMaterial(doc([]), {
			materialInstanceId: 'missing',
			fallbackCatalogueId: 'marble-light'
		});

		expect(result.catalogue).toBe('marble-light');
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('generates a stable variantSeed for identical inputs', () => {
		const a = resolveSceneMaterial(doc([]), { materialInstanceId: null, fallbackCatalogueId: 'plaster-warm' });
		const b = resolveSceneMaterial(doc([]), { materialInstanceId: null, fallbackCatalogueId: 'plaster-warm' });
		expect(a.variantSeed).toBe(b.variantSeed);
	});

	it('produces the same variantSeed for the same effective (slot, roughness, metalness)', () => {
		const args = (id: string) => [
			doc([{ id, name: 'M', baseMaterialId: 'plaster-warm', baseTextureId: 'wall-detail' }]),
			{ materialInstanceId: id, fallbackCatalogueId: 'plaster-warm' as const }
		] as const;
		const a = resolveSceneMaterial(...args('m1'));
		const b = resolveSceneMaterial(...args('m3'));
		expect(a.variantSeed).toBe(b.variantSeed);
	});

	it('produces different variantSeeds for different effective textures', () => {
		const args = (id: string, textureId: string) => [
			doc([{ id, name: 'M', baseMaterialId: 'plaster-warm', baseTextureId: textureId }]),
			{ materialInstanceId: id, fallbackCatalogueId: 'plaster-warm' as const }
		] as const;
		const wallResolve = resolveSceneMaterial(...args('m-wall', 'wall-detail'));
		const floorResolve = resolveSceneMaterial(...args('m-floor', 'floor-grain'));
		expect(wallResolve.variantSeed).not.toBe(floorResolve.variantSeed);
	});
});
