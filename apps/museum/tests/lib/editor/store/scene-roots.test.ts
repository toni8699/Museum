import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { EditorSceneRoots } from '$lib/editor/store/scene-roots.svelte';

/** A trivial Object3D factory that doesn't require any renderer/canvas. */
function makeRoot(tag: string): Object3D {
	const root = new Object3D();
	root.name = tag;
	return root;
}

describe('EditorSceneRoots', () => {
	describe('placement family', () => {
		it('registerPlacementRoot + getPlacementRoot round-trips', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('a');
			roots.registerPlacementRoot('a', root);
			expect(roots.getPlacementRoot('a')).toBe(root);
		});

		it('registerPlacementRoot is idempotent on the same Object3D', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('a');
			roots.registerPlacementRoot('a', root);
			const versionAfterFirst = roots.version;
			roots.registerPlacementRoot('a', root);
			expect(roots.version).toBe(versionAfterFirst);
		});

		it('registerPlacementRoot bumps version when the Object3D changes', () => {
			const roots = new EditorSceneRoots();
			roots.registerPlacementRoot('a', makeRoot('a'));
			const versionAfterFirst = roots.version;
			const replacement = makeRoot('a-replacement');
			roots.registerPlacementRoot('a', replacement);
			expect(roots.version).toBe(versionAfterFirst + 1);
			expect(roots.getPlacementRoot('a')).toBe(replacement);
		});

		it('unregisterPlacementRoot removes when the Object3D matches', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('a');
			roots.registerPlacementRoot('a', root);
			roots.unregisterPlacementRoot('a', root);
			expect(roots.getPlacementRoot('a')).toBeUndefined();
		});

		it('unregisterPlacementRoot silently no-ops when the Object3D does not match', () => {
			const roots = new EditorSceneRoots();
			roots.registerPlacementRoot('a', makeRoot('a'));
			const versionBefore = roots.version;
			roots.unregisterPlacementRoot('a', makeRoot('stale'));
			expect(roots.version).toBe(versionBefore);
			expect(roots.getPlacementRoot('a')).toBeDefined();
		});

		it('getPlacementRoot returns undefined for unknown ids', () => {
			const roots = new EditorSceneRoots();
			expect(roots.getPlacementRoot('unknown')).toBeUndefined();
		});
	});

	describe('camera-helper family', () => {
		it('round-trips via the (nodeId, handle) key', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('eye');
			roots.registerCameraHelperRoot('paris-seat', 'position', root);
			expect(roots.getCameraHelperRoot('paris-seat', 'position')).toBe(root);
			expect(
				roots.getCameraHelperRoot('paris-seat', 'target')
			).toBeUndefined();
		});

		it('re-registering the same Object3D is idempotent', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('eye');
			roots.registerCameraHelperRoot('paris-seat', 'position', root);
			const v = roots.version;
			roots.registerCameraHelperRoot('paris-seat', 'position', root);
			expect(roots.version).toBe(v);
		});
	});

	describe('anchor-helper family', () => {
		it('round-trips via the (connectionId, anchorId) key', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('anchor');
			roots.registerAnchorHelperRoot('conn-1', 'anchor-2', root);
			expect(roots.getAnchorHelperRoot('conn-1', 'anchor-2')).toBe(root);
			expect(
				roots.getAnchorHelperRoot('conn-1', 'anchor-3')
			).toBeUndefined();
		});
	});

	describe('view-keyframe-target-helper family', () => {
		it('round-trips via the (connectionId, direction, keyframeId) key', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('kf-target');
			roots.registerViewKeyframeTargetHelperRoot(
				'conn-1',
				'forward',
				'key-7',
				root
			);
			expect(
				roots.getViewKeyframeTargetHelperRoot('conn-1', 'forward', 'key-7')
			).toBe(root);
			expect(
				roots.getViewKeyframeTargetHelperRoot('conn-1', 'reverse', 'key-7')
			).toBeUndefined();
		});

		it('is idempotent on same Object3D', () => {
			const roots = new EditorSceneRoots();
			const root = makeRoot('kf-target');
			roots.registerViewKeyframeTargetHelperRoot(
				'conn-1',
				'forward',
				'key-7',
				root
			);
			const v = roots.version;
			roots.registerViewKeyframeTargetHelperRoot(
				'conn-1',
				'forward',
				'key-7',
				root
			);
			expect(roots.version).toBe(v);
		});
	});

	describe('ids() diagnostics', () => {
		it('lists only the keys of one family at a time', () => {
			const roots = new EditorSceneRoots();
			roots.registerPlacementRoot('p1', makeRoot('p1'));
			roots.registerPlacementRoot('p2', makeRoot('p2'));
			roots.registerCameraHelperRoot('n1', 'position', makeRoot('eye'));
			roots.registerAnchorHelperRoot('c1', 'a1', makeRoot('anchor'));

			expect(roots.ids('placement').sort()).toEqual(['p1', 'p2']);
			expect(roots.ids('camera-helper')).toEqual(['n1:position']);
			expect(roots.ids('anchor-helper')).toEqual(['c1:a1']);
			expect(roots.ids('view-keyframe-target-helper')).toEqual([]);
		});
	});

	describe('version monotonicity', () => {
		it('starts at 0', () => {
			expect(new EditorSceneRoots().version).toBe(0);
		});

		it('bumps only when a write actually changes state', () => {
			const roots = new EditorSceneRoots();
			roots.registerPlacementRoot('a', makeRoot('a'));
			const after1 = roots.version;
			roots.registerPlacementRoot('a', makeRoot('a')); // same content, fresh Object3D
			expect(roots.version).toBe(after1 + 1);
			roots.registerPlacementRoot('a', roots.getPlacementRoot('a')!); // same Object3D
			expect(roots.version).toBe(after1 + 1);
		});

		it('notifyPlacementRootChanged is a no-op when no placement root is registered for the id', () => {
			const roots = new EditorSceneRoots();
			roots.notifyPlacementRootChanged('nonexistent');
			expect(roots.version).toBe(0);
		});

		it('notifyPlacementRootChanged bumps version after a placement root is registered', () => {
			const roots = new EditorSceneRoots();
			roots.registerPlacementRoot('a', makeRoot('a'));
			const before = roots.version;
			roots.notifyPlacementRootChanged('a');
			expect(roots.version).toBe(before + 1);
		});
	});
});
