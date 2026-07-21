import { roomPoint } from '$lib/content/rooms';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { describe, expect, it } from 'vitest';
import {
	allocateCameraViewKeyframeId,
	createSceneCameraViewKeyframeAtWorldTarget,
	findSceneCameraViewKeyframe,
	getSceneCameraViewKeyframeWorldPosition,
	getSceneCameraViewKeyframeWorldTarget,
	writeSceneCameraViewKeyframeWorldTarget
} from './editor-camera-view';

function createDocument(): MuseumSceneDocument {
	return {
		version: 3,
		objects: [],
		navigationNodes: [
			{
				id: 'a',
				roomId: 'paris',
				label: 'A',
				position: [0, 1.65, 0],
				cameraTarget: [0, 1.25, -3],
				fov: 54,
				connectedNodeIds: ['b']
			},
			{
				id: 'b',
				roomId: 'paris',
				label: 'B',
				position: [8, 1.65, -2],
				cameraTarget: [8, 1.25, -5],
				fov: 54,
				connectedNodeIds: ['a']
			}
		],
		connections: [
			{
				id: 'a-b',
				fromNodeId: 'a',
				toNodeId: 'b',
				clearance: 0.35,
				positionPath: {
					kind: 'auto-bezier',
					anchors: [{ id: 'a-b-anchor-01', position: [4, 1.65, -4] }]
				},
				viewTracks: {
					forward: [
						{
							id: 'a-b-view-forward-01',
							progress: 0.4,
							cameraTarget: [2, 1.4, -6],
							fov: 48
						}
					],
					reverse: []
				}
			}
		]
	};
}

describe('editor camera view helpers', () => {
	it('allocates smallest direction-local IDs across both tracks', () => {
		expect(
			allocateCameraViewKeyframeId('a-b', 'forward', [
				'a-b-view-forward-01',
				'a-b-view-forward-03',
				'a-b-view-reverse-02'
			])
		).toBe('a-b-view-forward-02');
	});

	it('finds stable keys and resolves forward/reverse marker positions exactly', () => {
		const document = createDocument();
		const keyframe = findSceneCameraViewKeyframe(
			document,
			'a-b',
			'forward',
			'a-b-view-forward-01'
		)!;
		expect(keyframe.fov).toBe(48);
		expect(findSceneCameraViewKeyframe(document, 'a-b', 'reverse', keyframe.id)).toBeNull();
		const forward = getSceneCameraViewKeyframeWorldPosition(
			document,
			'a-b',
			'forward',
			0.4
		);
		const reverse = getSceneCameraViewKeyframeWorldPosition(
			document,
			'a-b',
			'reverse',
			0.6
		);
		expect(forward[0]).toBeCloseTo(reverse[0], 8);
		expect(forward[1]).toBeCloseTo(reverse[1], 8);
		expect(forward[2]).toBeCloseTo(reverse[2], 8);
	});

	it('creates room-local targets inside active room and preserves their basis on move', () => {
		const world = roomPoint('paris', [1, 1.4, -2]);
		const keyframe = createSceneCameraViewKeyframeAtWorldTarget(
			'view',
			0.5,
			world,
			52,
			'paris'
		);
		expect(keyframe.roomId).toBe('paris');
		expect(getSceneCameraViewKeyframeWorldTarget(keyframe)).toEqual(world);

		const moved = roomPoint('paris', [2, 1.6, -1]);
		writeSceneCameraViewKeyframeWorldTarget(keyframe, moved);
		expect(keyframe.roomId).toBe('paris');
		expect(getSceneCameraViewKeyframeWorldTarget(keyframe)).toEqual(moved);
	});
});
