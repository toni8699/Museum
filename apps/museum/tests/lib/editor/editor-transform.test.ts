import { describe, expect, it } from 'vitest';
import type { SceneObjectPlacement } from '$lib/content/scene';
import type { Vec3 } from '$lib/types/museum';
import { Object3D } from 'three';
import { museumSceneDocument } from '$lib/content/chopin-project';
import { cloneMuseumSceneDocument } from '$lib/editor/museum-editor.svelte';
import {
	degreesToRadians,
	enforceUniformObjectScale,
	MIN_PLACEMENT_SCALE,
	placementTransformFromDocument,
	placementTransformFromObject,
	radiansToDegrees,
	type PlacementTransform,
	writePlacementTransform
} from '$lib/editor/editor-transform';

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
		transform.scaleScalar = 1;
		expect(writePlacementTransform(placement, transform)).toBe(true);
		expect(placement.scale).toBeUndefined();

		transform.position[0] = Number.NaN;
		expect(writePlacementTransform(placement, transform)).toBe(false);
	});
});

// Phase 1a — PlacementTransform extended with scaleMode + scaleVector.
// Existing schema v6 still writes only `placement.scale` (scalar); the vector
// lives in the editor transform map.
describe('PlacementTransform — Phase 1a scaleVector + scaleMode', () => {
	it('placementTransformFromDocument reads scalar only', () => {
		const t = placementTransformFromDocument({
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: 2.5
		});
		expect(t.scale).toBe(2.5);
		expect(t.scaleScalar).toBe(2.5);
		expect(t.scaleVector).toBeNull();
		expect(t.scaleMode).toBe('uniform');
	});

	it('placementTransformFromDocument overlays a session-stashed vector', () => {
		const placement = { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: 2.5 };
		const t = placementTransformFromDocument(placement, [6, 0.1, 6] as Vec3);
		expect(t.scaleMode).toBe('independent');
		expect(t.scaleVector).toEqual([6, 0.1, 6]);
		expect(t.scaleScalar).toBeCloseTo((6 + 0.1 + 6) / 3, 6);
		// Schema v6 still only reads the on-document scalar; the visitor sees 2.5.
		expect(t.scale).toBe(2.5);
	});

	it('placementTransformFromDocument collapses an all-equal session vector back to uniform', () => {
		const placement = { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: 1 };
		const t = placementTransformFromDocument(placement, [3, 3, 3] as Vec3);
		expect(t.scaleMode).toBe('uniform');
		expect(t.scaleVector).toBeNull();
		expect(t.scaleScalar).toBe(3);
	});

	it('writePlacementTransform persists uniform scalar (drops when ≈ 1)', () => {
		const placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3
		};
		const t: PlacementTransform = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3,
			scale: 1.5,
			scaleScalar: 1.5,
			scaleVector: null,
			scaleMode: 'uniform' as const
		};
		expect(writePlacementTransform(placement, t)).toBe(true);
		expect(placement.scale).toBe(1.5);
	});

	it('writePlacementTransform with all-equal independent vector collapses to scalar', () => {
		const placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3
		};
		const t: PlacementTransform = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3,
			scale: 1,
			scaleScalar: 1,
			scaleVector: [3, 3, 3] as Vec3,
			scaleMode: 'independent' as const
		};
		expect(writePlacementTransform(placement, t)).toBe(true);
		expect(placement.scale).toBe(3);
	});

	it('writePlacementTransform with non-uniform vector persists scalar fallback (visitor)', () => {
		const placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3
		};
		const t: PlacementTransform = {
			position: [0, 0, 0] as Vec3,
			rotation: [0, 0, 0] as Vec3,
			scale: 1,
			scaleScalar: 1,
			scaleVector: [5, 3, 0.05] as Vec3,
			scaleMode: 'independent' as const
		};
		// Schema v6 limit: schema-v6 cannot carry per-axis vector; we want
		// visitor to render something — average is the spec's documented lossiness.
		expect(writePlacementTransform(placement, t)).toBe(true);
		const avg = (5 + 3 + 0.05) / 3;
		expect(placement.scale).toBeCloseTo(avg, 6);
	});

	it('placementTransformFromObject detects independent when scales differ', () => {
		const root = new Object3D();
		root.scale.set(5, 3, 0.05);
		const t = placementTransformFromObject(root);
		expect(t.scaleMode).toBe('independent');
		expect(t.scaleVector).toEqual([5, 3, 0.05]);
		expect(t.scaleScalar).toBeCloseTo((5 + 3 + 0.05) / 3, 6);
	});

	it('placementTransformFromObject collapses to uniform when scales equal', () => {
		const root = new Object3D();
		root.scale.set(2, 2, 2);
		const t = placementTransformFromObject(root);
		expect(t.scaleMode).toBe('uniform');
		expect(t.scaleVector).toBeNull();
		expect(t.scaleScalar).toBe(2);
	});

	it('placementTransformFromObject clamps each axis to MIN_PLACEMENT_SCALE', () => {
		const root = new Object3D();
		root.scale.set(-2, -2, -2);
		const t = placementTransformFromObject(root);
		expect(t.scaleMode).toBe('uniform');
		expect(t.scaleScalar).toBe(MIN_PLACEMENT_SCALE);
	});

	it('writePlacementTransform rejects negative vector component', () => {
		const placement = {
			position: [0, 0, 0] as [number, number, number],
			rotation: [0, 0, 0] as [number, number, number]
		};
		const t = {
			position: [0, 0, 0] as [number, number, number],
			rotation: [0, 0, 0] as [number, number, number],
			scale: 1,
			scaleScalar: 1,
			scaleVector: [1, -1, 1] as [number, number, number],
			scaleMode: 'independent' as const
		};
		expect(writePlacementTransform(placement, t)).toBe(false);
	});
});
