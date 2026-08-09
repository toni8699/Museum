import { describe, expect, it } from 'vitest';
import { Group, Mesh, BoxGeometry, Object3D } from 'three';

import { resolveMultiSelectPivot } from './pivot-resolve';

function makeRoot(id: string, x: number): Group {
	const g = new Group();
	g.position.set(x, 0, 0);
	g.add(new Mesh(new BoxGeometry(2, 1, 1)));
	g.userData.placementId = id;
	return g;
}

describe('resolveMultiSelectPivot', () => {
	it('returns null for empty roots', () => {
		expect(resolveMultiSelectPivot([], null, 'center', () => null)).toBeNull();
	});

	it('returns a centroid anchor in center mode even with lastSelectedId', () => {
		const a = makeRoot('a', 0);
		const b = makeRoot('b', 10);
		const result = resolveMultiSelectPivot(
			[a, b],
			'b',
			'center',
			(root) => (root.userData.placementId as string | null) ?? null
		);
		expect(result?.kind).toBe('center');
		if (result?.kind === 'center') {
			expect(result.anchor.position.x).toBeCloseTo(5, 6);
		}
	});

	it('returns the active-object root when lastSelectedId matches', () => {
		const a = makeRoot('a', 0);
		const b = makeRoot('b', 10);
		const result = resolveMultiSelectPivot(
			[a, b],
			'b',
			'active-object',
			(root) => (root.userData.placementId as string | null) ?? null
		);
		expect(result?.kind).toBe('active-object');
		if (result?.kind === 'active-object') {
			expect(result.root.userData.placementId).toBe('b');
		}
	});

	it('falls back to centroid when lastSelectedId does not match any root', () => {
		const a = makeRoot('a', 0);
		const b = makeRoot('b', 10);
		const result = resolveMultiSelectPivot(
			[a, b],
			'c',
			'active-object',
			(root) => (root.userData.placementId as string | null) ?? null
		);
		expect(result?.kind).toBe('center');
	});
});
