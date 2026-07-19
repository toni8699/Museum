import { describe, expect, it } from 'vitest';
import { Object3D, type Intersection } from 'three';
import {
	findCameraSelectionFromObject,
	findNavigationSelectionFromObject,
	isEditorCameraAnchorUserData,
	isEditorCameraConnectionUserData,
	isEditorCameraHandleUserData,
	resolveNormalSelection,
	selectionHitFromIntersection,
	uniquePlacementIdsInOrder,
	type SelectionHitInfo
} from './editor-selection';

function hit(
	placementId: string | null,
	cameraSelection?: SelectionHitInfo['cameraSelection'],
	opacity = 1
): SelectionHitInfo {
	return { opacity, placementId, cameraSelection };
}

describe('editor camera-helper selection', () => {
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
});
