import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { geometryId } from '$lib/layout/layout-geometry-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { g2MultipleOpeningsDocument, g2ObjectMatrixDocument, g2SceneNavigationGraph } from '../../layout/__fixtures__/layout-g2-fixtures';
import { g1DocumentWithRooms, g1RectangleRoom } from '../../layout/__fixtures__/layout-g1-fixtures';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
import {
	buildPlanCameraAuthoringProjection,
	buildPlanCameraProjection,
	resolvePlanSceneGraph,
	resolvePlanSceneGraphFromDocument
} from '$lib/editor/layout/plan-camera-projection';

/** Minimal two-node graph over one unrotated room (room-a at 0,0 6×4). */
function authoringDocument(): MuseumSceneDocument {
	return {
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [
			{
				id: 'n-a',
				roomId: 'room-a',
				label: 'A',
				position: [0, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-b']
			},
			{
				id: 'n-b',
				roomId: 'room-a',
				label: 'B',
				position: [6, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-a', 'n-c']
			},
			{
				id: 'n-c',
				roomId: 'room-a',
				label: 'C',
				position: [6, 1.6, 4],
				cameraTarget: [3, 1.2, 4],
				fov: 54,
				connectedNodeIds: ['n-b']
			}
		],
		connections: [
			{
				id: 'c-ab',
				fromNodeId: 'n-a',
				toNodeId: 'n-b',
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] },
				timing: {
					forward: { durationSeconds: 4.2, easing: 'smoothstep' }
				}
			},
			{
				id: 'c-bc',
				fromNodeId: 'n-b',
				toNodeId: 'n-c',
				clearance: 0.35,
				positionPath: {
					kind: 'rounded-polyline',
					anchors: [{ id: 'c-bc-anchor-01', position: [6, 1.6, 2] }]
				}
			}
		]
	};
}

function authoringRooms() {
	return createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 6, 4)]));
}

describe('buildPlanCameraProjection', () => {
	it('projects camera paths, view cones, look targets, and timing labels', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry);

		expect(projection.paths).toEqual([
			{ key: geometryId(['plan', 'camera-path', 'c0']), polyline: [[0, 0], [6, 0]], connectionId: 'c0' },
			{ key: geometryId(['plan', 'camera-path', 'c1']), polyline: [[6, 0], [6, 4]], connectionId: 'c1' },
			{ key: geometryId(['plan', 'camera-path', 'c2']), polyline: [[6, 4], [0, 0]], connectionId: 'c2' }
		]);

		expect(projection.viewCones).toEqual([
			{ key: geometryId(['plan', 'view-cone', 'n0']), origin: [0, 0], target: [3, 0], fovDegrees: 54, nodeId: 'n0' },
			{ key: geometryId(['plan', 'view-cone', 'n1']), origin: [6, 0], target: [6, 2], fovDegrees: 54, nodeId: 'n1' },
			{ key: geometryId(['plan', 'view-cone', 'n2']), origin: [6, 4], target: [3, 4], fovDegrees: 60, nodeId: 'n2' }
		]);

		expect(projection.lookTargets).toEqual([
			{ key: geometryId(['plan', 'look-target', 'n0']), point: [3, 0], nodeId: 'n0' },
			{ key: geometryId(['plan', 'look-target', 'n1']), point: [6, 2], nodeId: 'n1' },
			{ key: geometryId(['plan', 'look-target', 'n2']), point: [3, 4], nodeId: 'n2' }
		]);

		expect(projection.timingLabels).toEqual([
			{ key: geometryId(['plan', 'timing-label', 'c0']), anchor: [3, 0], text: '4s', connectionId: 'c0' },
			{ key: geometryId(['plan', 'timing-label', 'c1']), anchor: [6, 2], text: '4s', connectionId: 'c1' },
			{ key: geometryId(['plan', 'timing-label', 'c2']), anchor: [3, 2], text: '4s', connectionId: 'c2' }
		]);
	});

	it('emits no portal crossings or warnings without inputs', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry);
		expect(projection.portalCrossings).toEqual([]);
		expect(projection.collisionWarnings).toEqual([]);
	});

	it('places portal crossings at compiled opening centers', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const projection = buildPlanCameraProjection(g2SceneNavigationGraph(), geometry, {
			portalRelations: [
				{
					roomIds: ['room-openings', 'room-b'],
					openings: [{ roomId: 'room-openings', openingId: 'door-1', segmentId: 'room-openings:wall:0' }]
				}
			]
		});
		expect(projection.portalCrossings).toEqual([
			{ key: geometryId(['plan', 'portal-crossing', 'door-1']), point: [1.45, 0], openingId: 'door-1' }
		]);
	});

	it('places collision warnings at resolvable room, opening, and object targets', () => {
		const openings = compileLayoutGeometry(g2MultipleOpeningsDocument()).geometry;
		const roomAndOpening = buildPlanCameraProjection(g2SceneNavigationGraph(), openings, {
			issues: [
				{ path: 'p', code: 'self_intersection', message: 'm', targetId: 'room-openings' },
				{ path: 'p', code: 'opening_over_height', message: 'm', targetId: 'door-1' },
				{ path: 'p', code: 'object_invalid', message: 'm', targetId: 'missing' }
			]
		});
		expect(roomAndOpening.collisionWarnings).toEqual([
			{ key: geometryId(['plan', 'collision-warning', 'room-openings', 'self_intersection']), point: [5, 2], issueCode: 'self_intersection' },
			{ key: geometryId(['plan', 'collision-warning', 'door-1', 'opening_over_height']), point: [1.45, 0], issueCode: 'opening_over_height' }
		]);

		const objects = compileLayoutGeometry(g2ObjectMatrixDocument()).geometry;
		const objectWarning = buildPlanCameraProjection(g2SceneNavigationGraph(), objects, {
			issues: [{ path: 'p', code: 'object_invalid', message: 'm', targetId: 'obj-box' }]
		});
		expect(objectWarning.collisionWarnings).toEqual([
			{ key: geometryId(['plan', 'collision-warning', 'obj-box', 'object_invalid']), point: [1, 1], issueCode: 'object_invalid' }
		]);
	});
});

describe('resolvePlanSceneGraph', () => {
	it('resolves the canonical project through the shared scene path', () => {
		const graph = resolvePlanSceneGraph(chopinProject);
		expect(graph.navigationNodes).toHaveLength(chopinProject.scene.navigationNodes.length);
		expect(graph.connections).toHaveLength(chopinProject.scene.connections.length);
		expect(graph.nodeById.size).toBe(chopinProject.scene.navigationNodes.length);
		for (const node of graph.navigationNodes) {
			expect(node.position.every(Number.isFinite)).toBe(true);
			expect(node.cameraTarget.every(Number.isFinite)).toBe(true);
		}
	});
});

describe('resolvePlanSceneGraphFromDocument (P1.5 document-level resolver)', () => {
	it('resolves a live document against the supplied rooms, not a boot-time copy', () => {
		const document = authoringDocument();
		const rooms = authoringRooms();
		const graph = resolvePlanSceneGraphFromDocument(document, rooms);
		expect(graph.navigationNodes).toHaveLength(3);
		expect(graph.connections).toHaveLength(2);
		expect(graph.nodeById.get('n-a')!.position).toEqual([0, 1.6, 0]);
		expect(graph.nodeById.get('n-b')!.position).toEqual([6, 1.6, 0]);
	});

	it('reflects live document edits through the same registry', () => {
		const document = authoringDocument();
		const rooms = authoringRooms();
		document.navigationNodes[0]!.position = [2, 1.6, 1];
		const graph = resolvePlanSceneGraphFromDocument(document, rooms);
		expect(graph.nodeById.get('n-a')!.position).toEqual([2, 1.6, 1]);
	});
});	describe('buildPlanCameraAuthoringProjection (P1.5)', () => {
	function authoring(overrides: {
		selection?: NonNullable<Parameters<typeof buildPlanCameraAuthoringProjection>[2]>['selection'];
		mainFlowNodeIds?: string[];
		retainedConnectionIds?: string[];
	} = {}) {
		return buildPlanCameraAuthoringProjection(authoringDocument(), authoringRooms(), {
			selection: overrides.selection,
			mainFlowNodeIds: overrides.mainFlowNodeIds,
			retainedConnectionIds: overrides.retainedConnectionIds
		});
	}

	it('emits every topology edge once as exact shared draft-curve samples, with no arrow/cone/target primitives', () => {
		const projection = authoring();
		expect(projection.authoring!.connections).toHaveLength(2);
		const ab = projection.authoring!.connections.find((c) => c.connectionId === 'c-ab')!;
		const bc = projection.authoring!.connections.find((c) => c.connectionId === 'c-bc')!;
		// straight auto-bézier edge: endpoints resolved from node world positions.
		expect(ab.polyline[0]).toEqual([0, 0]);
		expect(ab.polyline.at(-1)).toEqual([6, 0]);
		expect(ab.polyline.length).toBeGreaterThanOrEqual(32);
		expect(ab.polyline.length).toBeLessThanOrEqual(512);
		for (const [x, z] of ab.polyline) {
			expect(z).toBeCloseTo(0, 9);
			expect(x).toBeGreaterThanOrEqual(-1e-9);
			expect(x).toBeLessThanOrEqual(6 + 1e-9);
		}
		// rounded-polyline edge passes through its interior anchor's XZ.
		expect(bc.polyline[0]).toEqual([6, 0]);
		expect(bc.polyline.at(-1)).toEqual([6, 4]);
		expect(bc.polyline.some(([, z]) => Math.abs(z - 2) < 0.4)).toBe(true);
		// the authoring profile carries no tour layers.
		expect(projection.paths).toEqual([]);
		expect(projection.viewCones).toEqual([]);
		expect(projection.lookTargets).toEqual([]);
		expect(projection.portalCrossings).toEqual([]);
		expect(projection.collisionWarnings).toEqual([]);
		expect(projection.timingLabels).toEqual([]);
	});

	it('the Camera Plan render model asserts the profile: no cone/target/path tokens in layers 6–9', () => {
		const { geometry } = compileLayoutGeometry(g2MultipleOpeningsDocument());
		const model = buildPlanRenderModel(
			geometry,
			authoring({ mainFlowNodeIds: ['n-a', 'n-b'] })
		);
		const layers69 = model.layers.filter((layer) => layer.order >= 6 && layer.order <= 9);
		const styles = layers69.flatMap((layer) => layer.primitives.map((primitive) => primitive.style));
		expect(styles).not.toContain('view-cone');
		expect(styles).not.toContain('look-target');
		expect(styles).not.toContain('camera-path');
		expect(styles).not.toContain('portal-crossing');
		expect(styles).not.toContain('collision-warning');
		expect(styles).not.toContain('timing-label');
		expect(styles).toContain('camera-edge');
		expect(styles).toContain('camera-node');
		expect(styles).toContain('camera-node-free');
		expect(styles).toContain('camera-order-label');
		expect(styles).toContain('camera-timing-label');
	});

	it('orders nodes 1…N from mainFlowNodeIds and marks free nodes unnumbered', () => {
		const projection = authoring({ mainFlowNodeIds: ['n-a', 'n-b'] });
		const nodes = projection.authoring!.nodes;
		expect(nodes.find((n) => n.nodeId === 'n-a')!.order).toBe(1);
		expect(nodes.find((n) => n.nodeId === 'n-b')!.order).toBe(2);
		expect(nodes.find((n) => n.nodeId === 'n-c')!.order).toBeNull();
		const orderLabels = projection.authoring!.labels.filter(
			(primitive) => primitive.style === 'camera-order-label'
		);
		expect(orderLabels.map((label) => (label.kind === 'text' ? label.text : ''))).toEqual(['1', '2']);
		expect(
			projection.authoring!.labels.some(
				(primitive) => primitive.style === 'camera-unsequenced-badge'
			)
		).toBe(true);
	});

	it('carries selected state and keeps retained edges visible (hover is post-model only)', () => {
		const projection = authoring({
			selection: { kind: 'connection', connectionId: 'c-ab' },
			retainedConnectionIds: ['c-bc']
		});
		const ab = projection.authoring!.connections.find((c) => c.connectionId === 'c-ab')!;
		const bc = projection.authoring!.connections.find((c) => c.connectionId === 'c-bc')!;
		expect(ab.selected).toBe(true);
		expect(ab.retained).toBe(false);
		expect(bc.selected).toBe(false);
		expect(bc.retained).toBe(true);
	});

	it('exposes interior anchors only for the relevant connection', () => {
		const none = authoring();
		expect(none.authoring!.anchors).toEqual([]);

		const selectedConnection = authoring({ selection: { kind: 'connection', connectionId: 'c-bc' } });
		expect(selectedConnection.authoring!.anchors).toHaveLength(1);
		expect(selectedConnection.authoring!.anchors[0]).toMatchObject({
			connectionId: 'c-bc',
			anchorId: 'c-bc-anchor-01',
			point: [6, 2]
		});

		const selectedAnchor = authoring({
			selection: { kind: 'anchor', connectionId: 'c-bc', anchorId: 'c-bc-anchor-01' }
		});
		expect(selectedAnchor.authoring!.anchors[0]!.selected).toBe(true);
	});

	it('labels both directions with effective duration, authored vs automatic distinguishable', () => {
		const projection = authoring();
		const timingLabels = projection.authoring!.labels.filter(
			(primitive) => primitive.style === 'camera-timing-label'
		);
		const abLabels = timingLabels
			.filter((label) => label.key.includes('c-ab'))
			.map((label) => (label.kind === 'text' ? label.text : ''));
		expect(abLabels).toEqual([
			expect.stringMatching(/^A→B 4\.2s$/),
			expect.stringMatching(/^B→A .* auto$/)
		]);
	});
});
