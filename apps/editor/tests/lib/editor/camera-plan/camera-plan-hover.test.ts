import { describe, expect, it } from 'vitest';
import type { SceneDocument } from '$lib/content/scene';
import { geometryId } from '$lib/layout/layout-geometry-types';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildPlanRenderModel, type PlanRenderPrimitive } from '$lib/layout/plan-render-model';
import { g1RectangleRoom, g1DocumentWithRooms } from '../../layout/__fixtures__/layout-g1-fixtures';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { buildPlanCameraAuthoringProjection } from '$lib/editor/layout/plan-camera-projection';
import { applyCameraPlanHover } from '$lib/editor/camera-plan/camera-plan-hover';

/** Three-node graph over one unrotated room (room-a at 0,0 6×4), one auto-bezier + one rounded-polyline edge. */
function authoringDocument(): SceneDocument {
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
				positionPath: { kind: 'auto-bezier', anchors: [] }
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

function layoutDocument() {
	return g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 6, 4)]);
}

function projection(options: {
	selection?: NonNullable<Parameters<typeof buildPlanCameraAuthoringProjection>[2]>['selection'];
	mainFlowNodeIds?: string[];
	retainedConnectionIds?: string[];
} = {}) {
	return buildPlanCameraAuthoringProjection(authoringDocument(), createLayoutRoomRegistry(layoutDocument()), {
		selection: options.selection,
		mainFlowNodeIds: options.mainFlowNodeIds,
		retainedConnectionIds: options.retainedConnectionIds
	});
}

function renderModel(selectedMainFlow: string[]) {
	const { geometry } = compileLayoutGeometry(layoutDocument());
	return buildPlanRenderModel(geometry, projection({ mainFlowNodeIds: selectedMainFlow }));
}

/** Camera authoring primitives live in layers 7–9; find the one with `key`. */
function styleByKey(model: ReturnType<typeof renderModel>, key: string): string | undefined {
	return model.layers
		.filter((layer) => layer.order >= 7 && layer.order <= 9)
		.flatMap((layer) => layer.primitives)
		.find((primitive) => primitive.key === key)?.style;
}

const NODE_A = geometryId(['plan', 'camera-node', 'n-a']);
const NODE_C = geometryId(['plan', 'camera-node', 'n-c']);
const EDGE_AB = geometryId(['plan', 'camera-edge', 'c-ab']);
const EDGE_BC = geometryId(['plan', 'camera-edge', 'c-bc']);
const ANCHOR_BC = geometryId(['plan', 'camera-anchor', 'c-bc', 'c-bc-anchor-01']);

describe('applyCameraPlanHover', () => {
	it('turns an ordered node, free node, edge, and anchor onto their hovered tokens', () => {
		const model = renderModel(['n-a', 'n-b']);
		expect(styleByKey(model, NODE_A)).toBe('camera-node');
		expect(styleByKey(model, NODE_C)).toBe('camera-node-free');
		expect(styleByKey(model, EDGE_AB)).toBe('camera-edge');
		expect(styleByKey(model, EDGE_BC)).toBe('camera-edge');

		const hoveredNode = applyCameraPlanHover(model, projection({ mainFlowNodeIds: ['n-a', 'n-b'] }).authoring, {
			kind: 'node',
			nodeId: 'n-a'
		});
		expect(styleByKey(hoveredNode, NODE_A)).toBe('camera-node-hovered');

		const hoveredFree = applyCameraPlanHover(model, projection({ mainFlowNodeIds: ['n-a', 'n-b'] }).authoring, {
			kind: 'node',
			nodeId: 'n-c'
		});
		expect(styleByKey(hoveredFree, NODE_C)).toBe('camera-node-hovered');

		const hoveredEdge = applyCameraPlanHover(model, projection().authoring, {
			kind: 'edge',
			connectionId: 'c-ab'
		});
		expect(styleByKey(hoveredEdge, EDGE_AB)).toBe('camera-edge-hovered');

		// anchors only exist when their connection is the relevant selection.
		const selectedConn = projection({ selection: { kind: 'connection', connectionId: 'c-bc' } });
		const anchorModel = buildPlanRenderModel(compileLayoutGeometry(layoutDocument()).geometry, selectedConn);
		expect(styleByKey(anchorModel, ANCHOR_BC)).toBe('camera-anchor');
		const hoveredAnchor = applyCameraPlanHover(
			anchorModel,
			selectedConn.authoring,
			{ kind: 'anchor', connectionId: 'c-bc', anchorId: 'c-bc-anchor-01' }
		);
		expect(styleByKey(hoveredAnchor, ANCHOR_BC)).toBe('camera-anchor-hovered');
		// the unselected node skeleton stays untouched (free nodes, no flow order).
		expect(styleByKey(hoveredAnchor, NODE_A)).toBe('camera-node-free');
	});

	it('precedence: selected wins over hovered for nodes, edges, and anchors', () => {
		const edge = projection({ selection: { kind: 'connection', connectionId: 'c-ab' } });
		const anchor = projection({ selection: { kind: 'anchor', connectionId: 'c-bc', anchorId: 'c-bc-anchor-01' } });
		const node = projection({ selection: { kind: 'node', nodeId: 'n-a' } });
		const { geometry } = compileLayoutGeometry(layoutDocument());
		const model = buildPlanRenderModel(geometry, edge);
		// c-ab selected, c-bc retained-free.
		expect(styleByKey(model, EDGE_AB)).toBe('camera-edge-selected');

		const hoveredSelectedEdge = applyCameraPlanHover(model, edge.authoring, {
			kind: 'edge',
			connectionId: 'c-ab'
		});
		expect(styleByKey(hoveredSelectedEdge, EDGE_AB)).toBe('camera-edge-selected');

		const hoveredWouldSelect = applyCameraPlanHover(model, edge.authoring, {
			kind: 'node',
			nodeId: 'n-b'
		});
		// independent, unrelated hover still applies.
		expect(styleByKey(hoveredWouldSelect, NODE_C)).toBe('camera-node-free');

		const nodeModel = buildPlanRenderModel(geometry, node);
		const hoveredSelectedNode = applyCameraPlanHover(nodeModel, node.authoring, {
			kind: 'node',
			nodeId: 'n-a'
		});
		// P21.5 Slice 2B — this fixture selects a FREE node, which now carries
		// its own token (selected unsequenced: tint + solid ring + halo).
		expect(styleByKey(hoveredSelectedNode, NODE_A)).toBe('camera-node-free-selected');

		const anchorModel = buildPlanRenderModel(geometry, anchor);
		const hoveredSelectedAnchor = applyCameraPlanHover(anchorModel, anchor.authoring, {
			kind: 'anchor',
			connectionId: 'c-bc',
			anchorId: 'c-bc-anchor-01'
		});
		expect(styleByKey(hoveredSelectedAnchor, ANCHOR_BC)).toBe('camera-anchor-selected');
	});

	it('keeps retained edges visibly distinct while showing hover state', () => {
		const retained = projection({ retainedConnectionIds: ['c-bc'], mainFlowNodeIds: ['n-a', 'n-b'] });
		const model = buildPlanRenderModel(compileLayoutGeometry(layoutDocument()).geometry, retained);
		expect(styleByKey(model, EDGE_BC)).toBe('camera-edge-retained');
		const retainedModel = applyCameraPlanHover(model, retained.authoring, {
			kind: 'edge',
			connectionId: 'c-bc'
		});
		expect(styleByKey(retainedModel, EDGE_BC)).toBe('camera-edge-retained-hovered');
	});

	it('keeps retained edges visibly distinct while showing selection state', () => {
		const retained = projection({
			retainedConnectionIds: ['c-bc'],
			mainFlowNodeIds: ['n-a', 'n-b'],
			selection: { kind: 'connection', connectionId: 'c-bc' }
		});
		const model = buildPlanRenderModel(compileLayoutGeometry(layoutDocument()).geometry, retained);
		expect(styleByKey(model, EDGE_BC)).toBe('camera-edge-retained-selected');
		const selectedModel = applyCameraPlanHover(model, retained.authoring, {
			kind: 'edge',
			connectionId: 'c-bc'
		});
		expect(styleByKey(selectedModel, EDGE_BC)).toBe('camera-edge-retained-selected');
	});

	it('returns the input model unchanged for null, missing, or stale hover identities', () => {
		const model = renderModel(['n-a', 'n-b']);
		const authoring = projection().authoring;
		expect(applyCameraPlanHover(model, authoring, null)).toBe(model);
		expect(applyCameraPlanHover(model, authoring, { kind: 'node', nodeId: 'missing' })).toBe(model);
		expect(applyCameraPlanHover(model, authoring, { kind: 'edge', connectionId: 'missing' })).toBe(model);
		expect(applyCameraPlanHover(model, authoring, { kind: 'anchor', connectionId: 'c-bc', anchorId: 'missing' })).toBe(model);
		// no authoring → no-op as well.
		expect(applyCameraPlanHover(model, undefined, { kind: 'node', nodeId: 'n-a' })).toBe(model);
	});
});
