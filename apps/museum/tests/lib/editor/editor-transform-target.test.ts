import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { getActiveTransformTarget } from '$lib/editor/editor-transform';

describe('getActiveTransformTarget', () => {
	const placementObject = new Object3D();
	const cameraObject = new Object3D();
	const base = {
		previewActive: false,
		pendingPlacement: false,
		placementKey: 'chair',
		placementObject,
		cameraSelection: null,
		cameraObject: undefined
	};

	it('resolves a placement pivot only when no camera selection owns the gizmo', () => {
		expect(getActiveTransformTarget(base)).toEqual({
			kind: 'placement',
			key: 'placement:chair',
			object: placementObject
		});
	});

	it('resolves the selected camera marker without inheriting placement state', () => {
		expect(
			getActiveTransformTarget({
				...base,
				cameraSelection: { nodeId: 'paris-seat', handle: 'target' },
				cameraObject
			})
		).toEqual({
			kind: 'camera',
			key: 'camera:paris-seat:target',
			object: cameraObject,
			nodeId: 'paris-seat',
			handle: 'target'
		});
	});

	it('does not fall back to a stale placement while a camera helper mounts', () => {
		expect(
			getActiveTransformTarget({
				...base,
				cameraSelection: { nodeId: 'paris-seat', handle: 'position' }
			})
		).toBeNull();
	});

	it('resolves stable anchors as world-space navigation targets', () => {
		const anchorObject = new Object3D();
		expect(
			getActiveTransformTarget({
				...base,
				navigationSelection: {
					kind: 'anchor',
					connectionId: 'a-b',
					anchorId: 'a-b-anchor-01'
				},
				anchorObject
			})
		).toEqual({
			kind: 'anchor',
			key: 'anchor:a-b:a-b-anchor-01',
			object: anchorObject,
			connectionId: 'a-b',
			anchorId: 'a-b-anchor-01'
		});
	});

	it('resolves selected view targets without falling back to placement', () => {
		const viewTargetObject = new Object3D();
		expect(
			getActiveTransformTarget({
				...base,
				navigationSelection: {
					kind: 'view-keyframe',
					connectionId: 'a-b',
					direction: 'forward',
					keyframeId: 'a-b-view-forward-01'
				},
				viewTargetObject
			})
		).toEqual({
			kind: 'view-target',
			key: 'view-target:a-b:forward:a-b-view-forward-01',
			object: viewTargetObject,
			connectionId: 'a-b',
			direction: 'forward',
			keyframeId: 'a-b-view-forward-01'
		});
	});

	it('detaches every target for preview and pending placement modes', () => {
		expect(getActiveTransformTarget({ ...base, previewActive: true })).toBeNull();
		expect(getActiveTransformTarget({ ...base, pendingPlacement: true })).toBeNull();
	});
});
