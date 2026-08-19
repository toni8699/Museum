import { describe, expect, it } from 'vitest';
import rawProject from '$lib/content/chopin-project.json';
import { chopinProject, chopinRuntime } from '$lib/content/chopin-project';
import { serializeMuseumProject, validateMuseumProject } from '$lib/project/project-codec';
import {
	createLayoutRoomRegistry,
	validateProjectSceneRooms
} from '$lib/project/project-layout-semantics';
import { projectLayoutPortalRelations } from '$lib/layout/layout-portals';
import type { Vec3 } from '$lib/types/museum';

const legacyFrames = {
	entrance: { origin: [0, 18], yaw: 0 },
	poland: { origin: [-12, 12], yaw: -Math.PI / 4 },
	departure: { origin: [-17, 0], yaw: -Math.PI / 2 },
	paris: { origin: [-10, -13], yaw: Math.atan2(-10, -13) },
	workshop: { origin: [10, -13], yaw: Math.atan2(10, -13) },
	'music-chamber': { origin: [0, 0], yaw: 0 },
	legacy: { origin: [13, 10], yaw: Math.atan2(13, 10) }
} as const;

function legacyPoint(roomId: string, local: Vec3): Vec3 {
	const frame = legacyFrames[roomId as keyof typeof legacyFrames];
	if (!frame) throw new Error(`Missing frozen legacy frame: ${roomId}`);
	const cos = Math.cos(frame.yaw);
	const sin = Math.sin(frame.yaw);
	return [
		frame.origin[0] + local[0] * cos + local[2] * sin,
		local[1],
		frame.origin[1] - local[0] * sin + local[2] * cos
	];
}

function expectVecClose(actual: Vec3, expected: Vec3, digits = 9): void {
	for (let index = 0; index < 3; index += 1) {
		expect(actual[index]).toBeCloseTo(expected[index], digits);
	}
}

describe('canonical Chopin project', () => {
	it('is canonical: raw JSON round-trips byte-stably through the codec', () => {
		const result = validateMuseumProject(rawProject);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(JSON.stringify(rawProject, null, 2) + '\n').toBe(serializeMuseumProject(chopinProject));
	});

	it('loads seven stable frames and seven explicit portal relations', () => {
		expect(chopinRuntime.rooms.entries).toHaveLength(7);
		expect(projectLayoutPortalRelations(chopinProject.layout)).toHaveLength(7);
		expect(chopinRuntime.graph.navigationNodes).toBe(chopinRuntime.scene.navigationNodes);
	});

	it('preserves frozen legacy transforms for every room-relative scene surface', () => {
		for (const entry of chopinRuntime.rooms.entries) {
			const expected = legacyFrames[entry.id as keyof typeof legacyFrames];
			expect(expected).toBeDefined();
			expect(entry.room.frame.origin[0]).toBeCloseTo(expected!.origin[0], 9);
			expect(entry.room.frame.origin[1]).toBeCloseTo(expected!.origin[1], 9);
			expect(entry.room.frame.yaw).toBeCloseTo(expected!.yaw, 9);
		}

		for (const entity of chopinProject.scene.entities) {
			expectVecClose(chopinRuntime.rooms.point(entity.roomId, entity.position), legacyPoint(entity.roomId, entity.position));
		}
		for (const [index, node] of chopinProject.scene.navigationNodes.entries()) {
			const runtimeNode = chopinRuntime.scene.navigationNodes[index]!;
			expectVecClose(runtimeNode.position, legacyPoint(node.roomId, node.position));
			expectVecClose(runtimeNode.cameraTarget, legacyPoint(node.roomId, node.cameraTarget));
		}
		for (const [connectionIndex, connection] of chopinProject.scene.connections.entries()) {
			const runtimeConnection = chopinRuntime.scene.connections[connectionIndex]!;
			for (const [anchorIndex, anchor] of connection.positionPath.anchors.entries()) {
				const expected = anchor.roomId ? legacyPoint(anchor.roomId, anchor.position) : anchor.position;
				expectVecClose(runtimeConnection.positionPath.anchors[anchorIndex + 1]!.position, expected);
			}
			for (const direction of ['forward', 'reverse'] as const) {
				for (const [keyframeIndex, keyframe] of (connection.viewTracks?.[direction] ?? []).entries()) {
					const expected = keyframe.roomId
						? legacyPoint(keyframe.roomId, keyframe.cameraTarget)
						: keyframe.cameraTarget;
					expectVecClose(runtimeConnection.viewTracks![direction][keyframeIndex]!.cameraTarget, expected);
				}
			}
		}
	});

	it('rejects every room-relative scene surface at its exact project path', () => {
		const cases: Array<{ path: string; mutate(project: any): void }> = [
			{
				path: '$.scene.entities[0].roomId',
				mutate: (project) => { project.scene.entities[0].roomId = 'missing-room'; }
			},
			{
				path: '$.scene.navigationNodes[0].roomId',
				mutate: (project) => { project.scene.navigationNodes[0].roomId = 'missing-room'; }
			},
			{
				path: '$.scene.connections[0].positionPath.anchors[0].roomId',
				mutate: (project) => { project.scene.connections[0].positionPath.anchors[0].roomId = 'missing-room'; }
			},
			{
				path: '$.scene.connections[0].targetWaypoints[0].roomId',
				mutate: (project) => {
					project.scene.connections[0].targetWaypoints ??= [{ position: [0, 1, 0] }];
					project.scene.connections[0].targetWaypoints[0].roomId = 'missing-room';
				}
			},
			{
				path: '$.scene.connections[0].viewTracks.forward[0].roomId',
				mutate: (project) => {
					project.scene.connections[0].viewTracks ??= { forward: [], reverse: [] };
					project.scene.connections[0].viewTracks.forward = [{
						id: 'test-room-ref', progress: 0.5, roomId: 'missing-room',
						cameraTarget: [0, 1, 0], fov: 54
					}];
				}
			}
		];

		for (const testCase of cases) {
			const input = JSON.parse(JSON.stringify(chopinProject));
			testCase.mutate(input);
			const result = validateMuseumProject(input);
			expect(result.success, testCase.path).toBe(false);
			if (!result.success) {
				expect(result.issues, testCase.path).toContainEqual(expect.objectContaining({
					path: testCase.path,
					code: 'unknown_room'
				}));
			}
		}
	});

	it('accepts valid framing envelopes and repeats ordering checks at the project gate', () => {
		const input = JSON.parse(JSON.stringify(chopinProject));
		const connection = input.scene.connections.find((candidate: any) => candidate.viewTracks);
		expect(connection).toBeDefined();
		connection.viewTracks.framingEnvelope = {
			forward: { enterStart: 0.1, enterEnd: 0.25, exitStart: 0.75, exitEnd: 1 }
		};
		const valid = validateMuseumProject(input);
		expect(valid.success).toBe(true);
		if (!valid.success) return;
		expect(serializeMuseumProject(input)).toBe(valid.canonicalJson);

		const connectionIndex = valid.project.scene.connections.findIndex(
			(candidate) => candidate.id === connection.id
		);
		const invalidInput = JSON.parse(JSON.stringify(input));
		invalidInput.scene.connections[connectionIndex].viewTracks
			.framingEnvelope.forward.exitStart = 0.2;
		const invalid = validateMuseumProject(invalidInput);
		expect(invalid.success).toBe(false);
		if (!invalid.success) {
			expect(invalid.issues).toContainEqual(expect.objectContaining({
				path: `$.scene.connections[${connectionIndex}].viewTracks.framingEnvelope.forward.exitStart`,
				code: 'invalid_framing_envelope'
			}));
		}

		valid.project.scene.connections[connectionIndex]!.viewTracks!
			.framingEnvelope!.forward!.exitStart = 0.2;
		expect(validateProjectSceneRooms(
			valid.project.scene,
			createLayoutRoomRegistry(valid.project.layout)
		)).toContainEqual(expect.objectContaining({
			path: `$.scene.connections[${connectionIndex}].viewTracks.framingEnvelope.forward.exitStart`,
			code: 'invalid_framing_envelope'
		}));
	});
});
