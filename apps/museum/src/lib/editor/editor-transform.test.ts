import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { museumSceneDocument } from '$lib/content/scene';
import { cloneMuseumSceneDocument } from './museum-editor.svelte';
import {
	degreesToRadians,
	enforceUniformObjectScale,
	MIN_PLACEMENT_SCALE,
	placementTransformFromDocument,
	radiansToDegrees,
	writePlacementTransform
} from './editor-transform';

// Slice 4 — the `editor placement transforms` describe block lives on this
// file now (it directly exercises `placementTransformFromDocument` /
// `writePlacementTransform` so it belongs with the dedicated transform
// suite).
describe('editor placement transforms', () => {
	it('converts degrees and radians at the inspector boundary', () => {
		expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
	});

	it('enforces one positive scale from the active axis', () => {
		const root = new Object3D();
		root.scale.set(2, 3, 4);
		expect(enforceUniformObjectScale(root, 'Y')).toBe(3);
		expect(root.scale.toArray()).toEqual([3, 3, 3]);

		root.scale.set(-2, -2, -2);
		expect(enforceUniformObjectScale(root, 'X')).toBe(MIN_PLACEMENT_SCALE);
		expect(root.scale.toArray()).toEqual([
			MIN_PLACEMENT_SCALE,
			MIN_PLACEMENT_SCALE,
			MIN_PLACEMENT_SCALE
		]);
	});

	it('omits unit scale and rejects invalid transform values', () => {
		const placement = cloneMuseumSceneDocument(museumSceneDocument).entities[0]!;
		const transform = placementTransformFromDocument(placement);
		transform.scale = 1;
		expect(writePlacementTransform(placement, transform)).toBe(true);
		expect(placement.scale).toBeUndefined();

		transform.position[0] = Number.NaN;
		expect(writePlacementTransform(placement, transform)).toBe(false);
	});
});
