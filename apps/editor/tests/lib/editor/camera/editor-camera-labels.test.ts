import { describe, expect, it } from 'vitest';
import { buildCameraNodeLabelKinds } from '$lib/editor/camera/editor-camera-labels';

describe('editor camera 3D node label kinds (P1.7 shell spec "Viewport MUST show")', () => {
	const nodes = [
		{ id: 'entrance-start' },
		{ id: 'tour-b' },
		{ id: 'detour-1' },
		{ id: 'overlook' }
	];

	it('numbers main-flow nodes 1..N in chain order', () => {
		expect(buildCameraNodeLabelKinds(['entrance-start', 'tour-b'], nodes)).toEqual([
			{ nodeId: 'entrance-start', order: 1, unsequenced: false },
			{ nodeId: 'tour-b', order: 2, unsequenced: false },
			{ nodeId: 'detour-1', order: null, unsequenced: true },
			{ nodeId: 'overlook', order: null, unsequenced: true }
		]);
	});

	it('badges every node when no flow exists (empty chain is valid)', () => {
		for (const kind of buildCameraNodeLabelKinds([], nodes)) {
			expect(kind.order).toBeNull();
			expect(kind.unsequenced).toBe(true);
		}
	});

	it('stays consistent when the flow omits nodes present in the document', () => {
		const kinds = buildCameraNodeLabelKinds(['overlook'], nodes);
		expect(kinds.find((kind) => kind.nodeId === 'overlook')).toEqual({
			nodeId: 'overlook',
			order: 1,
			unsequenced: false
		});
		expect(kinds.find((kind) => kind.nodeId === 'tour-b')?.unsequenced).toBe(true);
	});

	it('returns an empty model for an empty document', () => {
		expect(buildCameraNodeLabelKinds(['a'], [])).toEqual([]);
	});
});
