import { roomPoint } from '$lib/content/rooms';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { describe, expect, it } from 'vitest';
import {
	allocateCameraViewKeyframeId,
	createSceneCameraViewKeyframeAtWorldTarget,
	findSceneCameraViewKeyframe,
	getSceneCameraViewKeyframeWorldPosition,
	getSceneCameraViewKeyframeWorldTarget,
	mirrorCameraViewTrack,
	seedEmptyReverseViewTrack,
	syncReverseViewTrackFromForward,
	writeSceneCameraViewKeyframeWorldTarget
} from './editor-camera-view';

function createDocument(): MuseumSceneDocument {
	return {
		version: 5,
		entities: [],
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

	it('mirrors a view track with remapped progress and fresh destination IDs', () => {
		const mirrored = mirrorCameraViewTrack(
			'a-b',
			[
				{
					id: 'a-b-view-forward-01',
					progress: 0.25,
					cameraTarget: [1, 2, 3],
					fov: 40
				},
				{
					id: 'a-b-view-forward-02',
					progress: 0.75,
					cameraTarget: [4, 5, 6],
					fov: 50,
					roomId: 'paris'
				}
			],
			'reverse',
			['a-b-view-forward-01', 'a-b-view-forward-02']
		);
		expect(mirrored.map((keyframe) => keyframe.progress)).toEqual([0.25, 0.75]);
		expect(mirrored.map((keyframe) => keyframe.cameraTarget)).toEqual([
			[4, 5, 6],
			[1, 2, 3]
		]);
		expect(mirrored[0]!.roomId).toBe('paris');
		expect(mirrored.every((keyframe) => keyframe.id.includes('-view-reverse-'))).toBe(true);
	});

	it('seeds empty reverse once and refuses to overwrite existing reverse keys', () => {
		const document = createDocument();
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: 'a-b-view-forward-01',
					progress: 0.4,
					cameraTarget: [1, 1, 1],
					fov: 48
				}
			],
			reverse: []
		};
		expect(seedEmptyReverseViewTrack(connection)).toBe(true);
		expect(connection.viewTracks.reverse).toHaveLength(1);
		expect(connection.viewTracks.reverse[0]!.progress).toBeCloseTo(0.6, 6);
		expect(seedEmptyReverseViewTrack(connection)).toBe(false);
		expect(connection.viewTracks.reverse).toHaveLength(1);
	});

	it('syncReverseViewTrackFromForward replaces reverse with a full forward mirror', () => {
		const document = createDocument();
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: 'a-b-view-forward-01',
					progress: 0.3,
					cameraTarget: [1, 1, 1],
					fov: 40
				},
				{
					id: 'a-b-view-forward-02',
					progress: 0.7,
					cameraTarget: [2, 2, 2],
					fov: 50
				}
			],
			reverse: [
				{
					id: 'stale-reverse',
					progress: 0.5,
					cameraTarget: [9, 9, 9],
					fov: 30
				}
			]
		};
		expect(syncReverseViewTrackFromForward(connection)).toBe(true);
		expect(connection.viewTracks.reverse).toHaveLength(2);
		expect(connection.viewTracks.reverse.map((keyframe) => keyframe.cameraTarget)).toEqual([
			[2, 2, 2],
			[1, 1, 1]
		]);
		expect(connection.viewTracks.reverse.some((keyframe) => keyframe.id === 'stale-reverse')).toBe(
			false
		);
	});
});
