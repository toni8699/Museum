import { describe, expect, it } from 'vitest';
import { Object3D, type Intersection } from 'three';
import {
	findCameraSelectionFromObject,
	findCameraFovHandleFromObject,
	findCameraViewKeyframeHandleFromObject,
	findNavigationSelectionFromObject,
	findPriorityCameraViewKeyframeHandle,
	filterEffectiveHits,
	isEditorCameraAnchorUserData,
	isEditorCameraConnectionUserData,
	isEditorCameraHandleUserData,
	isEditorCameraFovHandleUserData,
	isEditorCameraViewKeyframeUserData,
	NEAR_INVISIBLE_OPACITY,
	nextPlacementCycleId,
	resolveNormalSelection,
	selectionHitFromIntersection,
	uniquePlacementIdsInOrder,
	type SelectionHitInfo
} from '$lib/editor/editor-selection';

function hit(
	placementId: string | null,
	cameraSelection?: SelectionHitInfo['cameraSelection'],
	opacity = 1
): SelectionHitInfo {
	return { opacity, placementId, cameraSelection };
}

describe('editor camera-helper selection', () => {
	it('recognizes and climbs node and key FOV side handles', () => {
		const nodeRoot = new Object3D();
		nodeRoot.userData = {
			editorEntity: 'camera-fov-handle',
			owner: 'node',
			nodeId: 'paris-seat',
			side: 'top'
		};
		const child = new Object3D();
		nodeRoot.add(child);
		expect(isEditorCameraFovHandleUserData(nodeRoot.userData)).toBe(true);
		expect(findCameraFovHandleFromObject(child)).toEqual({
			owner: 'node',
			nodeId: 'paris-seat',
			side: 'top'
		});
		expect(
			isEditorCameraFovHandleUserData({
				editorEntity: 'camera-fov-handle',
				owner: 'view-keyframe',
				connectionId: 'a-b',
				direction: 'sideways',
				keyframeId: 'key-1',
				side: 'bottom'
			})
		).toBe(false);
	});

	it('recognizes only complete camera-handle userData tags', () => {
		expect(
			isEditorCameraHandleUserData({
				editorEntity: 'camera-handle',
				nodeId: 'paris-seat',
				cameraHandle: 'position'
			})
		).toBe(true);
		expect(
			isEditorCameraHandleUserData({
				editorEntity: 'camera-handle',
				nodeId: 'paris-seat',
				cameraHandle: 'rotation'
			})
		).toBe(false);
		expect(
			isEditorCameraHandleUserData({
				editorEntity: 'camera-handle',
				cameraHandle: 'target'
			})
		).toBe(false);
	});

	it('climbs from helper geometry to the tagged helper root', () => {
		const helperRoot = new Object3D();
		helperRoot.userData = {
			editorEntity: 'camera-handle',
			nodeId: 'vienna-seat',
			cameraHandle: 'target'
		};
		const markerGeometry = new Object3D();
		helperRoot.add(markerGeometry);

		expect(findCameraSelectionFromObject(markerGeometry)).toEqual({
			nodeId: 'vienna-seat',
			handle: 'target'
		});
		expect(findCameraSelectionFromObject(new Object3D())).toBeNull();
		expect(findCameraSelectionFromObject(null)).toBeNull();
	});

	it('includes the climbed camera selection in intersection hit info', () => {
		const helperRoot = new Object3D();
		helperRoot.userData = {
			editorEntity: 'camera-handle',
			nodeId: 'departure-seat',
			cameraHandle: 'position'
		};
		const markerGeometry = new Object3D();
		helperRoot.add(markerGeometry);

		expect(
			selectionHitFromIntersection({ object: markerGeometry } as Intersection)
		).toEqual({
			opacity: 1,
			placementId: null,
			cameraSelection: {
				nodeId: 'departure-seat',
				handle: 'position'
			},
			navigationSelection: {
				kind: 'node',
				nodeId: 'departure-seat',
				handle: 'position'
			}
		});
	});

	it('gives an effective camera helper normal-click precedence over placements', () => {
		expect(
			resolveNormalSelection([
				hit('chair-placement'),
				hit(null, { nodeId: 'paris-seat', handle: 'target' })
			])
		).toEqual({
			action: 'select-camera',
			selection: { nodeId: 'paris-seat', handle: 'target' }
		});
	});

	it('ignores near-invisible camera helpers for normal selection', () => {
		expect(
			resolveNormalSelection([
				hit(null, { nodeId: 'paris-seat', handle: 'position' }, 0.01),
				hit('piano-placement')
			])
		).toEqual({ action: 'select', id: 'piano-placement' });
	});

	it('keeps Alt-cycle placement-only and ignores camera-only hits', () => {
		expect(
			uniquePlacementIdsInOrder([
				hit(null, { nodeId: 'paris-seat', handle: 'position' }),
				hit('chair-placement'),
				hit(null, { nodeId: 'paris-seat', handle: 'target' }),
				hit('piano-placement'),
				hit('chair-placement')
			])
		).toEqual(['chair-placement', 'piano-placement']);
	});

	it('recognizes and climbs stable connection and anchor tags', () => {
		expect(
			isEditorCameraConnectionUserData({
				editorEntity: 'camera-connection',
				connectionId: 'a-b'
			})
		).toBe(true);
		expect(
			isEditorCameraAnchorUserData({
				editorEntity: 'camera-anchor',
				connectionId: 'a-b',
				anchorId: 'a-b-anchor-01'
			})
		).toBe(true);

		const connectionRoot = new Object3D();
		connectionRoot.userData = {
			editorEntity: 'camera-connection',
			connectionId: 'a-b'
		};
		const anchorRoot = new Object3D();
		anchorRoot.userData = {
			editorEntity: 'camera-anchor',
			connectionId: 'a-b',
			anchorId: 'a-b-anchor-01'
		};
		connectionRoot.add(anchorRoot);
		expect(findNavigationSelectionFromObject(anchorRoot)).toEqual({
			kind: 'anchor',
			connectionId: 'a-b',
			anchorId: 'a-b-anchor-01'
		});
	});

	it('prefers anchors over connections and keeps both out of placement cycling', () => {
		const anchorSelection = {
			kind: 'anchor' as const,
			connectionId: 'a-b',
			anchorId: 'a-b-anchor-01'
		};
		const connectionSelection = {
			kind: 'connection' as const,
			connectionId: 'a-b'
		};
		const hits: SelectionHitInfo[] = [
			{ opacity: 1, placementId: 'chair', navigationSelection: connectionSelection },
			{ opacity: 1, placementId: null, navigationSelection: anchorSelection }
		];
		expect(resolveNormalSelection(hits)).toEqual({
			action: 'select-navigation',
			selection: anchorSelection
		});
		expect(uniquePlacementIdsInOrder(hits)).toEqual(['chair']);
	});

	it('recognizes view-key tags and gives them path-pick precedence', () => {
		expect(
			isEditorCameraViewKeyframeUserData({
				editorEntity: 'camera-view-keyframe',
				connectionId: 'a-b',
				direction: 'forward',
				keyframeId: 'a-b-view-forward-01',
				viewHandle: 'position'
			})
		).toBe(true);
		expect(
			isEditorCameraViewKeyframeUserData({
				editorEntity: 'camera-view-keyframe',
				connectionId: 'a-b',
				direction: 'sideways',
				keyframeId: 'bad',
				viewHandle: 'position'
			})
		).toBe(false);

		const connectionRoot = new Object3D();
		connectionRoot.userData = {
			editorEntity: 'camera-connection',
			connectionId: 'a-b'
		};
		const viewRoot = new Object3D();
		viewRoot.userData = {
			editorEntity: 'camera-view-keyframe',
			connectionId: 'a-b',
			direction: 'reverse',
			keyframeId: 'a-b-view-reverse-01',
			viewHandle: 'position'
		};
		const viewChild = new Object3D();
		viewRoot.add(viewChild);
		const viewSelection = {
			kind: 'view-keyframe' as const,
			connectionId: 'a-b',
			direction: 'reverse' as const,
			keyframeId: 'a-b-view-reverse-01'
		};
		expect(findNavigationSelectionFromObject(viewChild)).toEqual(viewSelection);
		expect(
			resolveNormalSelection([
				{
					opacity: 1,
					placementId: 'chair',
					navigationSelection: {
						kind: 'connection',
						connectionId: 'a-b'
					}
				},
				{ opacity: 1, placementId: null, navigationSelection: viewSelection }
			])
		).toEqual({ action: 'select-navigation', selection: viewSelection });
	});

	it('gives the target handle precedence over an overlapping derived eye marker', () => {
		const positionRoot = new Object3D();
		positionRoot.userData = {
			editorEntity: 'camera-view-keyframe',
			connectionId: 'a-b',
			direction: 'forward',
			keyframeId: 'view-01',
			viewHandle: 'position'
		};
		const positionChild = new Object3D();
		positionRoot.add(positionChild);
		const targetRoot = new Object3D();
		targetRoot.userData = {
			editorEntity: 'camera-view-keyframe',
			connectionId: 'a-b',
			direction: 'forward',
			keyframeId: 'view-01',
			viewHandle: 'target'
		};

		expect(findCameraViewKeyframeHandleFromObject(positionChild)).toMatchObject({
			keyframeId: 'view-01',
			viewHandle: 'position'
		});
		expect(
			findPriorityCameraViewKeyframeHandle([positionChild, targetRoot])
		).toMatchObject({
			keyframeId: 'view-01',
			viewHandle: 'target'
		});
	});
});

// Slice 4 — the `editor-selection helpers` describe block lives on this file
// now (it tests the pure selection helpers from `./editor-selection`).
describe('editor-selection helpers', () => {
	const hits = (entries: Array<[number, string | null]>): SelectionHitInfo[] =>
		entries.map(([opacity, placementId]) => ({ opacity, placementId }));

	it('filters near-invisible hits for normal selection', () => {
		expect(
			resolveNormalSelection(
				hits([
					[NEAR_INVISIBLE_OPACITY - 0.01, 'ghost'],
					[1, 'piano']
				])
			)
		).toEqual({ action: 'select', id: 'piano' });

		expect(resolveNormalSelection(hits([[1, null]]))).toEqual({ action: 'deselect' });
		expect(resolveNormalSelection(hits([]))).toEqual({ action: 'deselect' });
	});

	it('dedupes placement ids while preserving hit order', () => {
		expect(
			uniquePlacementIdsInOrder(
				hits([
					[0.01, 'a'],
					[1, 'b'],
					[1, 'c'],
					[1, 'b'],
					[1, 'd']
				])
			)
		).toEqual(['b', 'c', 'd']);
	});

	it('implements cycle next-id rules', () => {
		expect(nextPlacementCycleId('x', [])).toBeUndefined();
		expect(nextPlacementCycleId(null, ['a', 'b'])).toBe('a');
		expect(nextPlacementCycleId('z', ['a', 'b'])).toBe('a');
		expect(nextPlacementCycleId('a', ['a', 'b'])).toBe('b');
		expect(nextPlacementCycleId('b', ['a', 'b'])).toBe('a');
	});

	it('keeps near-invisible hits out of effective lists', () => {
		expect(filterEffectiveHits(hits([[0.01, 'a'], [0.05, 'b'], [1, 'c']]))).toEqual([
			{ opacity: 0.05, placementId: 'b' },
			{ opacity: 1, placementId: 'c' }
		]);
	});
});
