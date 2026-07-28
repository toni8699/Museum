import { describe, expect, it } from 'vitest';
import { getRoom, museumRooms, roomLocalPoint, roomPoint } from './rooms';
import legacyRuntimeScene from './__fixtures__/legacy-runtime-scene.json';
import {
  assertNavigationGraphMatchesScene,
  createNavigationGraph,
  museumSceneDocument,
  resolveSceneDocument,
  type MuseumSceneDocument
} from './scene';
import { validateSceneDocument } from './scene-codec';

const PRE_CAMERA_NODE_ID = 'camera-node-1';
const PRE_CAMERA_CONNECTION_IDS = new Set([
  'paris-seat-camera-node-1',
  'camera-node-1-workshop-desk'
]);

/**
 * Phase 3.6 inserts `camera-node-1` as a seam between `paris-seat` and
 * `workshop-desk`. To compare the canonical 9-node document against the
 * frozen 8-cycle legacy fixture, this helper both filters the seam
 * (node + two new connections) *and* structurally rewires the two
 * surviving nav nodes whose `nextNodeId` / `previousNodeId` previously
 * detoured through it, restoring the direct paris-seat ↔ workshop-desk
 * ring that existed pre-Phase-3.6.
 */
const LEGACY_CYCLE_OVERRIDES: Record<
  string,
  { nextNodeId?: string; previousNodeId?: string }
> = {
  'paris-seat': { nextNodeId: 'workshop-desk' },
  'workshop-desk': { previousNodeId: 'paris-seat' }
};

function reduceCanonicalToLegacyOrigin(resolved: ReturnType<typeof resolveSceneDocument>) {
  return {
    ...resolved,
    navigationNodes: resolved.navigationNodes
      .filter((node) => node.id !== PRE_CAMERA_NODE_ID)
      .map((node) => ({
        ...node,
        connectedNodeIds: node.connectedNodeIds.filter(
          (id) => id !== PRE_CAMERA_NODE_ID
        ),
        nextNodeId:
          node.nextNodeId === PRE_CAMERA_NODE_ID
            ? LEGACY_CYCLE_OVERRIDES[node.id]?.nextNodeId
            : node.nextNodeId,
        previousNodeId:
          node.previousNodeId === PRE_CAMERA_NODE_ID
            ? LEGACY_CYCLE_OVERRIDES[node.id]?.previousNodeId
            : node.previousNodeId
      })),
    connections: resolved.connections.filter(
      (connection) => !PRE_CAMERA_CONNECTION_IDS.has(connection.id)
    )
  };
}

function versionOneDocument(): unknown {
	return {
		...museumSceneDocument,
		version: 1,
		navigationNodes: museumSceneDocument.navigationNodes.map(({ fov: _fov, ...node }) => node),
    connections: museumSceneDocument.connections.map(
      ({ positionPath, viewTracks: _viewTracks, targetWaypoints: _targetWaypoints, ...connection }) => ({
        ...connection,
        positionWaypoints: positionPath.anchors.map(({ id: _id, ...waypoint }) => waypoint)
      })
    )
  };
}

describe('resolveSceneDocument', () => {
  it('rejects unknown placement asset IDs at the scene boundary', () => {
    const invalid = {
      ...museumSceneDocument,
      objects: museumSceneDocument.objects.map((object, index) =>
        index === 0 ? { ...object, assetId: 'missing-asset' } : object
      )
    };

    expect(() => resolveSceneDocument(invalid)).toThrow(/Unknown museum asset/);
  });

  it('rejects invalid scene-authoritative placement fallbacks', () => {
    const invalid = JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
    (invalid.objects[0] as unknown as { fallback: string }).fallback = 'not-a-fallback';
    expect(() => resolveSceneDocument(invalid)).toThrow(/invalid_fallback/);
  });

  it('matches the frozen pre-migration origin (camera-node-1 seam detached)', () => {
    const preFiltered = reduceCanonicalToLegacyOrigin(
      resolveSceneDocument(museumSceneDocument)
    );
    const legacyObjectShape = preFiltered.objects.map(({ roomId: _roomId, ...placement }) => placement);
    const legacyNavigationNodeShape = preFiltered.navigationNodes.map(({ fov: _fov, ...node }) => node);
    const legacyConnectionShape = preFiltered.connections.map(
      ({ positionPath, ...connection }) => ({
        ...connection,
        positionWaypoints: positionPath.anchors.map((anchor) => anchor.position)
      })
    );

    expect({
      objects: legacyObjectShape,
      navigationNodes: legacyNavigationNodeShape,
      connections: legacyConnectionShape
    }).toEqual(legacyRuntimeScene);
  });

  it('resolves the complete checked-in document with room-local objects intact', () => {
    const resolved = resolveSceneDocument(museumSceneDocument);

    expect(museumSceneDocument.objects).toHaveLength(21);
    expect(museumSceneDocument.navigationNodes).toHaveLength(9);
    expect(museumSceneDocument.connections).toHaveLength(10);
    expect(
      museumSceneDocument.connections.reduce(
        (count, connection) => count + connection.positionPath.anchors.length,
        0
      )
    ).toBe(45);

    for (const [index, node] of museumSceneDocument.navigationNodes.entries()) {
      expect(resolved.navigationNodes[index].position).toEqual(
        roomPoint(node.roomId, node.position)
      );
      expect(resolved.navigationNodes[index].cameraTarget).toEqual(
        roomPoint(node.roomId, node.cameraTarget)
      );
    }

    for (const object of resolved.objects) {
      expect(() => getRoom(object.roomId)).not.toThrow();
      expect(object.position).toEqual(
        museumSceneDocument.objects.find((candidate) => candidate.id === object.id)?.position
      );
    }
  });

  it('is deterministic, non-mutating, and independently allocated', () => {
    const serializedBefore = JSON.stringify(museumSceneDocument);
    const first = resolveSceneDocument(museumSceneDocument);
    const second = resolveSceneDocument(museumSceneDocument);

    expect(JSON.stringify(museumSceneDocument)).toBe(serializedBefore);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.objects[0]).not.toBe(second.objects[0]);
    expect(first.navigationNodes[0].position).not.toBe(second.navigationNodes[0].position);
    expect(first.connections[0].positionPath).not.toBe(second.connections[0].positionPath);
    expect(first.connections[0].positionPath.anchors).not.toBe(
      second.connections[0].positionPath.anchors
    );
  });

  it('inserts value-equal node endpoints without sharing their arrays', () => {
    const resolved = resolveSceneDocument(museumSceneDocument);
    const nodeById = new Map(resolved.navigationNodes.map((node) => [node.id, node]));

    for (const connection of resolved.connections) {
      const fromNode = nodeById.get(connection.fromNodeId);
      const toNode = nodeById.get(connection.toNodeId);
      const first = connection.positionPath.anchors[0];
      const last = connection.positionPath.anchors.at(-1);

      expect(fromNode).toBeDefined();
      expect(toNode).toBeDefined();
      expect(first?.id).toBe(`node:${fromNode?.id}:position`);
      expect(last?.id).toBe(`node:${toNode?.id}:position`);
      expect(first?.position).toEqual(fromNode?.position);
      expect(last?.position).toEqual(toNode?.position);
      expect(first?.position).not.toBe(fromNode?.position);
      expect(last?.position).not.toBe(toNode?.position);
    }
  });

  it('survives a JSON serialization round-trip', () => {
    const roundTripped = JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;

    expect(roundTripped).toEqual(museumSceneDocument);
    expect(resolveSceneDocument(roundTripped)).toEqual(resolveSceneDocument(museumSceneDocument));
  });

  it('resolves a valid version 1 document to the migrated runtime (modulo v3-only refinements)', () => {
    const legacy = versionOneDocument();
    const before = JSON.stringify(legacy);

    // v1 schema cannot carry viewTracks, targetWaypoints, positionPath.kind, or
    // per-node fov, so v1 → v3 migration fills them with defaults. The fields
    // the comparison *does* strictly assert (positions, anchors, generated
    // endpoints, navigation adjacency, room-coord transforms) are the ones v1
    // *does* carry. Custom fov / auto-bezier paths are verified in the
    // dedicated graph and timeline tests downstream.
    const expected = resolveSceneDocument(museumSceneDocument);
    // Guardrail: resolver must hand back an independently-allocated runtime
    // instance, so mutating `expected` here cannot bleed into other tests.
    expect(expected).not.toBe(resolveSceneDocument(museumSceneDocument));

    for (const connection of expected.connections) {
      if ('viewTracks' in connection) delete connection.viewTracks;
      if ('targetWaypoints' in connection) delete connection.targetWaypoints;
      connection.positionPath.kind = 'rounded-polyline';
    }
    for (const node of expected.navigationNodes) {
      node.fov = 54;
    }

    expect(resolveSceneDocument(legacy)).toEqual(expected);
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it('resolves mixed-space position and target waypoints with fresh endpoints', () => {
    const document: MuseumSceneDocument = {
      version: 3,
      objects: [
        {
          id: 'scaled-object',
          roomId: 'paris',
          assetId: 'paris-book',
          fallback: 'books',
          position: [1, 2, 3],
          rotation: [0, 0.5, 0],
          scale: 0.75
        }
      ],
      navigationNodes: [
        {
          id: 'from',
          roomId: 'entrance',
          label: 'From',
          position: [0, 1.65, 0],
          cameraTarget: [0, 1, -1],
          fov: 54,
          connectedNodeIds: ['to'],
          nextNodeId: 'to',
          previousNodeId: 'to'
        },
        {
          id: 'to',
          roomId: 'poland',
          label: 'To',
          position: [0, 1.65, 0],
          cameraTarget: [0, 1, -1],
          fov: 54,
          connectedNodeIds: ['from'],
          nextNodeId: 'from',
          previousNodeId: 'from'
        }
      ],
      connections: [
        {
          id: 'from-to',
          fromNodeId: 'from',
          toNodeId: 'to',
          clearance: 0.4,
          positionPath: {
            kind: 'auto-bezier',
            anchors: [
              { id: 'from-to-anchor-01', roomId: 'poland', position: [1, 1.65, 0] },
              { id: 'from-to-anchor-02', position: [8, 1.65, 8] }
            ]
          },
          viewTracks: {
            forward: [
              {
                id: 'from-to-view-forward-01',
                progress: 0.3,
                roomId: 'paris',
                cameraTarget: [1, 1.4, 2],
                fov: 48
              }
            ],
            reverse: [
              {
                id: 'from-to-view-reverse-01',
                progress: 0.65,
                cameraTarget: [20, 1.2, 20],
                fov: 62
              }
            ]
          },
          targetWaypoints: [
            { roomId: 'entrance', position: [1, 1, -1] },
            { position: [7, 1, 7] }
          ]
        }
      ]
    };
    const resolved = resolveSceneDocument(document);
    const [from, to] = resolved.navigationNodes;
    const [connection] = resolved.connections;

    expect(connection.positionPath).toEqual({
      kind: 'auto-bezier',
      anchors: [
        { id: 'node:from:position', position: from.position },
        { id: 'from-to-anchor-01', position: roomPoint('poland', [1, 1.65, 0]) },
        { id: 'from-to-anchor-02', position: [8, 1.65, 8] },
        { id: 'node:to:position', position: to.position }
      ]
    });
    expect(connection.targetWaypoints).toEqual([
      from.cameraTarget,
      roomPoint('entrance', [1, 1, -1]),
      [7, 1, 7],
      to.cameraTarget
    ]);
    expect(connection.viewTracks).toEqual({
      forward: [
        {
          id: 'from-to-view-forward-01',
          progress: 0.3,
          cameraTarget: roomPoint('paris', [1, 1.4, 2]),
          fov: 48
        }
      ],
      reverse: [
        {
          id: 'from-to-view-reverse-01',
          progress: 0.65,
          cameraTarget: [20, 1.2, 20],
          fov: 62
        }
      ]
    });
    expect(connection.positionPath.anchors[0]?.position).not.toBe(from.position);
    expect(connection.targetWaypoints?.[0]).not.toBe(from.cameraTarget);
    expect(connection.viewTracks?.forward[0]?.cameraTarget).not.toBe(
      document.connections[0]!.viewTracks?.forward[0]?.cameraTarget
    );
    expect(connection.viewTracks?.forward[0]).not.toHaveProperty('roomId');
    expect(resolved.objects[0]).toEqual(document.objects[0]);
    expect(resolved.objects[0]).not.toBe(document.objects[0]);
    expect(resolved.objects[0].position).not.toBe(document.objects[0].position);
  });  it('rejects unsupported versions, duplicate ids, and unknown endpoints', () => {
		const cloneDocument = () =>
			JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
		const unsupported = cloneDocument();
		(unsupported as unknown as { version: number }).version = 5;
		expect(() => resolveSceneDocument(unsupported)).toThrow(
			'Unsupported museum scene document version: 5'
		);

		const duplicate = cloneDocument();
		duplicate.objects.push({ ...duplicate.objects[0] });
		expect(() => resolveSceneDocument(duplicate)).toThrow(
			`Duplicate scene object id: ${duplicate.objects[0].id}`
		);

		const unknownEndpoint = cloneDocument();
		unknownEndpoint.connections[0].toNodeId = 'missing-node';
		expect(() => resolveSceneDocument(unknownEndpoint)).toThrow(
			'Unknown navigation node: missing-node'
		);
	});

  it('keeps the canonical version pinned to 3 for the v3 input without timing fields', () => {
    const clone = JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
    expect(clone.version).toBe(3);
    const validation = validateSceneDocument(clone);
    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.document.version).toBe(3);
      expect(validation.document).toEqual(clone);
    }
  });

  it('accepts authored v4 timing and projects it onto runtime scene/instances', () => {
    const v4: MuseumSceneDocument = {
      version: 4,
      objects: museumSceneDocument.objects.slice(0, 1),
      navigationNodes: museumSceneDocument.navigationNodes.map((node, index) =>
        index === 1
          ? { ...node, holdSeconds: 2.5 }
          : node
      ),
      connections: [
        {
          ...museumSceneDocument.connections[0]!,
          timing: {
            forward: { durationSeconds: 3.2, easing: 'ease-in-out' }
          },
          viewTracks: {
            forward: [
              {
                id: museumSceneDocument.connections[0]!.viewTracks?.forward[0]?.id ?? 'kf-1',
                progress: 0.5,
                cameraTarget: [1, 1.4, -2],
                fov: 48,
                holdSeconds: 1.0,
                easing: 'ease-in'
              }
            ],
            reverse: []
          }
        },
        ...museumSceneDocument.connections.slice(1).map((connection) => ({
          ...connection,
          ...(connection.viewTracks ? { viewTracks: connection.viewTracks } : {})
        }))
      ]
    };
    const resolved = resolveSceneDocument(v4);
    const paris = resolved.navigationNodes.find(
      (node) => node.id === 'poland-threshold'
    )!;
    expect(paris.holdSeconds).toBe(2.5);
    const connection = resolved.connections[0]!;
    expect(connection.timing?.forward?.durationSeconds).toBe(3.2);		expect(connection.timing?.forward?.easing).toBe('smoothstep');
    expect(connection.viewTracks?.forward[0]?.holdSeconds).toBe(1.0);
    expect(connection.viewTracks?.forward[0]?.easing).toBe('ease-in');
  });

  it('rejects v4 documents with malformed timing payloads', () => {
    const v4: MuseumSceneDocument = {
      version: 4,
      objects: museumSceneDocument.objects.slice(0, 1),
      navigationNodes: museumSceneDocument.navigationNodes,
      connections: [
        {
          ...museumSceneDocument.connections[0]!,
          timing: {
            forward: { durationSeconds: 0 }
          }
        },
        ...museumSceneDocument.connections.slice(1)
      ]
    };
    expect(() => resolveSceneDocument(v4)).toThrow(/invalid_duration_seconds/);
  });

  it('validates editor clusters while keeping runtime rendering flat', () => {
		const document = JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
		const [first, second] = document.objects;
		document.clusters = [
			{
				id: 'cluster-1',
				name: 'Reading corner',
				roomId: first.roomId,
				memberIds: [first.id, second.id]
			}
		];
		const resolved = resolveSceneDocument(document);
		expect(resolved.objects).toHaveLength(document.objects.length);
		expect(resolved).not.toHaveProperty('clusters');

		const duplicateMember = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		duplicateMember.clusters![0]!.memberIds = [first.id, first.id];
		expect(() => resolveSceneDocument(duplicateMember)).toThrow('Duplicate member');

		const tooSmall = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		tooSmall.clusters![0]!.memberIds = [first.id];
		expect(() => resolveSceneDocument(tooSmall)).toThrow('at least two members');

		const missing = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		missing.clusters![0]!.memberIds = [first.id, 'missing'];
		expect(() => resolveSceneDocument(missing)).toThrow('Unknown member');

		const multiple = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		multiple.clusters!.push({
			id: 'cluster-2',
			name: 'Duplicate ownership',
			roomId: first.roomId,
			memberIds: [first.id, document.objects[2]!.id]
		});
		expect(() => resolveSceneDocument(multiple)).toThrow('multiple clusters');
	});

  it('requires navigation state and scene data to share one runtime instance', () => {
    const first = resolveSceneDocument(museumSceneDocument);
    const second = resolveSceneDocument(museumSceneDocument);
    const graph = createNavigationGraph(first);

    expect(() => assertNavigationGraphMatchesScene(graph, first)).not.toThrow();
    expect(() => assertNavigationGraphMatchesScene(graph, second)).toThrow(
      'Museum navigation state must use the same resolved scene instance'
    );
  });

  it('keeps node adjacency, connection edges, and guided links consistent', () => {
    const resolved = resolveSceneDocument(museumSceneDocument);
    const adjacency = new Map<string, Set<string>>(
      resolved.navigationNodes.map((node) => [node.id, new Set<string>()])
    );

    for (const connection of resolved.connections) {
      adjacency.get(connection.fromNodeId)?.add(connection.toNodeId);
      adjacency.get(connection.toNodeId)?.add(connection.fromNodeId);
    }

    for (const node of resolved.navigationNodes) {
      expect(new Set(node.connectedNodeIds)).toEqual(adjacency.get(node.id));
      expect(adjacency.get(node.id)?.has(node.nextNodeId ?? '')).toBe(true);
      expect(adjacency.get(node.id)?.has(node.previousNodeId ?? '')).toBe(true);
    }

    const nodeById = new Map(resolved.navigationNodes.map((node) => [node.id, node]));
    const startId = 'entrance-start';
    const visited = new Set<string>();
    let cursor = nodeById.get(startId);

    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      cursor = cursor.nextNodeId ? nodeById.get(cursor.nextNodeId) : undefined;
    }

    expect(visited.size).toBe(resolved.navigationNodes.length);
    expect(cursor?.id).toBe(startId);
  });
});

describe('room coordinate transforms', () => {
  const localSamples = [
    [0, 0, 0],
    [1.25, 2.4, -3.75],
    [-4.1, 1.65, 2.2]
  ] as const;
  const worldSamples = [
    [0, 1.65, 0],
    [-12.4, 3.2, 8.75],
    [19.1, -0.2, -17.6]
  ] as const;

  for (const room of museumRooms) {
    it(`round-trips local and world points for ${room.id}`, () => {
      for (const local of localSamples) {
        const recovered = roomLocalPoint(room.id, roomPoint(room.id, [...local]));
        local.forEach((value, index) => expect(recovered[index]).toBeCloseTo(value, 12));
      }

      for (const world of worldSamples) {
        const recovered = roomPoint(room.id, roomLocalPoint(room.id, [...world]));
        world.forEach((value, index) => expect(recovered[index]).toBeCloseTo(value, 12));
      }
    });
  }
});
