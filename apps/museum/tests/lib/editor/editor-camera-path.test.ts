import { roomPoint } from '$lib/content/rooms';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { createCameraPositionPath } from '$lib/museum/navigation/camera-motion';
import type { Vec3 } from '$lib/types/museum';
import { CurvePath, LineCurve3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
	allocateCameraPathAnchorId,
	createDraftConnectionPositionPath,
	createScenePathAnchorAtWorldPoint,
	EDITOR_CAMERA_PATH_MAX_SAMPLES,
	EDITOR_CAMERA_PATH_MIN_SAMPLES,
	EDITOR_CAMERA_PATH_MOVE_EPSILON,
	EDITOR_CAMERA_PATH_SAMPLES_PER_METER,
	findNearestCurveProgress,
	findScenePathAnchor,
	getCameraPathInsertionIndex,
	getCameraPathVisualSampleCount,
	getScenePathAnchorWorldPosition,
	resolveDraftConnectionPathPart,
	writeScenePathAnchorWorldPosition
} from '$lib/editor/editor-camera-path';

function createDocument(
	kind: 'rounded-polyline' | 'auto-bezier' = 'rounded-polyline'
): MuseumSceneDocument {
	return {
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [
			{
				id: 'from',
				roomId: 'paris',
				label: 'From',
				position: [1, 1.65, 2],
				cameraTarget: [0, 1.25, 0],
				fov: 54,
				connectedNodeIds: ['to']
			},
			{
				id: 'to',
				roomId: 'workshop',
				label: 'To',
				position: [-2, 1.65, 1],
				cameraTarget: [0, 1.25, 0],
				fov: 54,
				connectedNodeIds: ['from']
			}
		],
		connections: [
			{
				id: 'from-to',
				fromNodeId: 'from',
				toNodeId: 'to',
				clearance: 0.35,
				positionPath: {
					kind,
					anchors: [
						{
							id: 'from-to-anchor-01',
							roomId: 'paris',
							position: [2, 1.65, 1]
						},
						{ id: 'from-to-anchor-02', position: [0, 1.65, -4] }
					]
				}
			}
		]
	};
}

function expectVec3Close(actual: Vec3, expected: Vec3) {
	expect(actual[0]).toBeCloseTo(expected[0]);
	expect(actual[1]).toBeCloseTo(expected[1]);
	expect(actual[2]).toBeCloseTo(expected[2]);
}

function linePath(length: number) {
	const path = new CurvePath<Vector3>();
	path.add(new LineCurve3(new Vector3(), new Vector3(length, 0, 0)));
	return path;
}

describe('draft camera path resolution', () => {
	it('resolves generated node endpoints and authored anchors into fresh world tuples', () => {
		const document = createDocument();
		const part = resolveDraftConnectionPathPart(document, 'from-to');
		expect(part.kind).toBe('rounded-polyline');
		if (part.kind !== 'rounded-polyline') throw new Error('Expected rounded path');

		expect(part.clearance).toBe(0.35);
		expect(part.points).toEqual([
			roomPoint('paris', [1, 1.65, 2]),
			roomPoint('paris', [2, 1.65, 1]),
			[0, 1.65, -4],
			roomPoint('workshop', [-2, 1.65, 1])
		]);

		(part.points[0] as Vec3)[0] = 999;
		expect(document.navigationNodes[0]?.position).toEqual([1, 1.65, 2]);
		expect(resolveDraftConnectionPathPart(document, 'from-to')).not.toBe(part);
	});

	it('emits an auto-bezier part and builds it with the shared curve compiler', () => {
		const document = createDocument('auto-bezier');
		const part = resolveDraftConnectionPathPart(document, 'from-to');
		expect(part.kind).toBe('auto-bezier');
		if (part.kind !== 'auto-bezier') throw new Error('Expected auto path');

		const draftPath = createDraftConnectionPositionPath(document, 'from-to');
		const sharedPath = createCameraPositionPath([part]);
		for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
			expect(draftPath.getPointAt(progress).distanceTo(sharedPath.getPointAt(progress))).toBeLessThan(
				1e-10
			);
		}
	});

	it('builds reverse direction from the same shared geometry compiler', () => {
		const document = createDocument('auto-bezier');
		const forward = createDraftConnectionPositionPath(document, 'from-to');
		const reverse = createDraftConnectionPositionPath(
			document,
			'from-to',
			'reverse'
		);
		for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
			expect(
				reverse
					.getPointAt(progress)
					.distanceTo(forward.getPointAt(1 - progress))
			).toBeLessThan(1e-8);
		}
	});

	it('rejects missing connections and missing endpoint nodes', () => {
		const document = createDocument();
		expect(() => resolveDraftConnectionPathPart(document, 'missing')).toThrow(
			'Unknown scene connection: missing'
		);
		document.navigationNodes.splice(1, 1);
		expect(() => resolveDraftConnectionPathPart(document, 'from-to')).toThrow(
			'Unknown navigation node in scene connection: to'
		);
	});
});

describe('camera path anchor helpers', () => {
	it('allocates the smallest free stable ID with deterministic padding', () => {
		expect(
			allocateCameraPathAnchorId('from-to', [
				'from-to-anchor-01',
				'from-to-anchor-03',
				'unrelated-anchor-02'
			])
		).toBe('from-to-anchor-02');

		const firstNinetyNine = Array.from(
			{ length: 99 },
			(_value, index) => `edge-anchor-${String(index + 1).padStart(2, '0')}`
		);
		expect(allocateCameraPathAnchorId('edge', firstNinetyNine)).toBe('edge-anchor-100');
	});

	it('resolves anchors by stable ID after draft replacement', () => {
		const document = createDocument();
		expect(findScenePathAnchor(document, 'from-to', 'from-to-anchor-02')?.position).toEqual([
			0,
			1.65,
			-4
		]);
		expect(findScenePathAnchor(document, 'from-to', 'missing')).toBeNull();
		expect(findScenePathAnchor(document, 'missing', 'from-to-anchor-02')).toBeNull();
	});

	it('stores a new hit room-local only inside the active yawed room', () => {
		const local: Vec3 = [1.25, 1.8, -2.5];
		const inside = roomPoint('paris', local);
		const anchor = createScenePathAnchorAtWorldPoint('new-anchor', inside, 'paris');
		expect(anchor.roomId).toBe('paris');
		expectVec3Close(anchor.position, local);
		expectVec3Close(getScenePathAnchorWorldPosition(anchor), inside);

		const outside: Vec3 = [100, 1.8, 100];
		expect(createScenePathAnchorAtWorldPoint('outside', outside, 'paris')).toEqual({
			id: 'outside',
			position: outside
		});
		expect(createScenePathAnchorAtWorldPoint('no-room', inside, null)).toEqual({
			id: 'no-room',
			position: inside
		});
	});

	it('writes world movement while preserving existing room ownership', () => {
		const anchor = createDocument().connections[0]!.positionPath.anchors[0]!;
		const outsideWorld: Vec3 = [40, 2.25, -35];
		writeScenePathAnchorWorldPosition(anchor, outsideWorld);

		expect(anchor.roomId).toBe('paris');
		expectVec3Close(getScenePathAnchorWorldPosition(anchor), outsideWorld);

		const worldAnchor = createDocument().connections[0]!.positionPath.anchors[1]!;
		const nextWorld: Vec3 = [3, 2, -8];
		writeScenePathAnchorWorldPosition(worldAnchor, nextWorld);
		expect(worldAnchor).toEqual({ id: 'from-to-anchor-02', position: nextWorld });
	});

	it('rejects non-finite authored movement', () => {
		const anchor = createDocument().connections[0]!.positionPath.anchors[0]!;
		expect(() =>
			writeScenePathAnchorWorldPosition(anchor, [Number.NaN, 1.65, 0])
		).toThrow('Camera path anchor position must contain exactly three finite numbers');
	});
});

describe('camera path curve math', () => {
	it('finds nearest normalized progress with coarse search and refinement', () => {
		const path = createCameraPositionPath([
			{
				kind: 'auto-bezier',
				anchors: [
					[0, 0, 0],
					[2, 1, 3],
					[7, -1, 4],
					[10, 0, 0]
				]
			}
		]);
		const expectedProgress = 0.637;
		const exactPoint = path.getPointAt(expectedProgress);
		const actualProgress = findNearestCurveProgress(path, exactPoint);
		expect(Math.abs(actualProgress - expectedProgress)).toBeLessThan(1e-4);
	});

	it('keeps endpoint picks exact and handles degenerate paths', () => {
		const path = linePath(10);
		expect(findNearestCurveProgress(path, [-5, 0, 0])).toBe(0);
		expect(findNearestCurveProgress(path, [15, 0, 0])).toBe(1);

		const degenerate = linePath(0);
		expect(findNearestCurveProgress(degenerate, [4, 2, 1])).toBe(0);
	});

	it('maps normalized progress to the containing auto-curve insertion index', () => {
		const path = new CurvePath<Vector3>();
		path.add(new LineCurve3(new Vector3(0, 0, 0), new Vector3(2, 0, 0)));
		path.add(new LineCurve3(new Vector3(2, 0, 0), new Vector3(7, 0, 0)));
		path.add(new LineCurve3(new Vector3(7, 0, 0), new Vector3(10, 0, 0)));

		expect(getCameraPathInsertionIndex(path, 0.1)).toBe(0);
		expect(getCameraPathInsertionIndex(path, 0.3)).toBe(1);
		expect(getCameraPathInsertionIndex(path, 0.9)).toBe(2);
		expect(getCameraPathInsertionIndex(path, 1)).toBe(2);
		expect(() => getCameraPathInsertionIndex(path, Number.NaN)).toThrow(
			'Camera path progress must be finite'
		);
	});

	it('clamps visual divisions to 8 per metre within 32–512', () => {
		expect(EDITOR_CAMERA_PATH_SAMPLES_PER_METER).toBe(8);
		expect(getCameraPathVisualSampleCount(linePath(1))).toBe(
			EDITOR_CAMERA_PATH_MIN_SAMPLES
		);
		expect(getCameraPathVisualSampleCount(linePath(10))).toBe(80);
		expect(getCameraPathVisualSampleCount(linePath(100))).toBe(
			EDITOR_CAMERA_PATH_MAX_SAMPLES
		);
		expect(EDITOR_CAMERA_PATH_MOVE_EPSILON).toBe(1e-4);
	});
});
