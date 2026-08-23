import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { buildRoomWallMesh, type IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
import type { LayoutDocument } from '$lib/layout/layout-types';	import {
		buildLayout3dTriangleIndex,
		isLayoutDirectPickDeferred,
		layoutCandidatesFromIntersections,
		layoutPickBeatsSceneDistance,
		layoutSelectionKey,
		LAYOUT_3D_SAME_DEPTH_EPSILON,
		resolveLayout3dHits,
		type Layout3dHitCandidate,
		type Layout3dPickIndex,
		type RaycastHitLike
	} from '$lib/editor/layout/layout-3d-picking';
import {
	clearLayoutSelection,
	createLayoutInteractionState,
	selectLayoutInteriorAnchor,
	selectLayoutObject,
	selectLayoutOpening,
	selectLayoutRoom,
	selectLayoutWall,
	type LayoutInteractionState
} from '$lib/editor/layout/layout-interaction';
import { deriveActiveSelection } from '$lib/editor/app/active-editor-selection.svelte';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { g1MultipleOpeningsDocument } from '../../layout/__fixtures__/layout-g1-fixtures';

function buildMesh(document: LayoutDocument = g1MultipleOpeningsDocument()): IndexedWallMesh {
	const room = compileLayoutGeometry(document).geometry.rooms[0];
	if (!room) throw new Error('fixture compiled to no room');
	const result = buildRoomWallMesh(room, { assertWinding: true });
	if (!result.mesh) throw new Error('builder rejected fixture');
	return result.mesh;
}

function wallFixture(): { mesh: IndexedWallMesh; indices: ReadonlyMap<string, Layout3dPickIndex>; wallTriangle: number } {
	const mesh = buildMesh();
	const indices = new Map([[mesh.roomId, buildLayout3dTriangleIndex(mesh)]]);
	const range = mesh.pickRanges.find((candidate) => candidate.kind === 'wall');
	if (!range) throw new Error('fixture has no wall pick range');
	return { mesh, indices, wallTriangle: range.start / 3 };
}

// Structural synthetic intersections — no three.js objects, so the extraction
// path is exercised against exactly the `RaycastHitLike` shape the coordinator
// reads (pinning that no `Intersection` type ever crosses the purity boundary).
type HitNode = { userData: unknown; parent: HitNode | null };

function node(userData: unknown = {}, parent: HitNode | null = null): HitNode {
	return { userData, parent };
}

function rayHit(object: HitNode, distance: number, faceIndex: number | null = null): RaycastHitLike {
	return { object, distance, faceIndex };
}

describe('layoutCandidatesFromIntersections', () => {
	it('identifies wall, floor, and ceiling surfaces from authored object-level userData', () => {
		const wall = node({ surfaceType: 'wall', roomId: 'r1' });
		const floor = node({ surfaceType: 'floor', roomId: 'r1' });
		const ceiling = node({ surfaceType: 'ceiling', roomId: 'r1' });

		expect(layoutCandidatesFromIntersections([rayHit(wall, 1, 7)])).toEqual([
			{ kind: 'wall-triangle', roomId: 'r1', triangleIndex: 7, distance: 1 }
		]);
		expect(layoutCandidatesFromIntersections([rayHit(floor, 2)])).toEqual([
			{ kind: 'room-surface', roomId: 'r1', surface: 'floor', distance: 2 }
		]);
		expect(layoutCandidatesFromIntersections([rayHit(ceiling, 3)])).toEqual([
			{ kind: 'room-surface', roomId: 'r1', surface: 'ceiling', distance: 3 }
		]);
	});

	it('pins triangleIndex = faceIndex (indexed-buffer triangle number, never an index offset)', () => {
		// faceIndex 7 is the seventh triangle of the indexed buffer — copied
		// as-is, never divided by 3.
		const wall = node({ surfaceType: 'wall', roomId: 'r1' });
		expect(layoutCandidatesFromIntersections([rayHit(wall, 1, 7)])).toEqual([
			{ kind: 'wall-triangle', roomId: 'r1', triangleIndex: 7, distance: 1 }
		]);
	});

	it('drops a wall hit without a faceIndex (defensive)', () => {
		const wall = node({ surfaceType: 'wall', roomId: 'r1' });
		expect(layoutCandidatesFromIntersections([rayHit(wall, 1, null)])).toEqual([]);
	});

	it('finds layout-object and layout-anchor identity on parent groups (walk-up)', () => {
		const objectChild = node({}, node({ editorEntity: 'layout-object', layoutObjectId: 'obj-1' }));
		expect(layoutCandidatesFromIntersections([rayHit(objectChild, 2)])).toEqual([
			{ kind: 'object', objectId: 'obj-1', distance: 2 }
		]);

		const anchorChild = node(
			{},
			node({ editorEntity: 'layout-anchor', roomId: 'r1', segmentId: 'r1:wall:0', anchorId: 'a1' })
		);
		expect(layoutCandidatesFromIntersections([rayHit(anchorChild, 2)])).toEqual([
			{ kind: 'anchor', roomId: 'r1', segmentId: 'r1:wall:0', anchorId: 'a1', distance: 2 }
		]);
	});

	it('produces no candidate for scene entities, the highlight shell, or camera helpers', () => {
		const sceneEntity = node({ editorEntity: 'placement', placementId: 'chair' });
		const highlight = node({ name: 'LayoutWallHighlight' });
		const cameraHelper = node({ editorEntity: 'camera-handle', nodeId: 'n1', cameraHandle: 'position' });

		expect(
			layoutCandidatesFromIntersections([
				rayHit(sceneEntity, 1, 0),
				rayHit(highlight, 2, 0),
				rayHit(cameraHelper, 3, 0)
			])
		).toEqual([]);
	});
});

describe('commit route (pure shell mirror)', () => {
	/**
	 * Mirror of `Workspace3DView.handleLayoutPick` — identical resolve + yield + commit
	 * path over the same pure primitives. Kept in sync by the S6 source-assertion
	 * contract test (which pins the component's actual wiring), so this exercises
	 * the route without a Svelte mount.
	 */
	function applyLayoutPick(
		interaction: LayoutInteractionState,
		indices: ReadonlyMap<string, Layout3dPickIndex>,
		candidates: readonly Layout3dHitCandidate[],
		competingSceneDistance: number | null
	): boolean {
		const resolved = resolveLayout3dHits(indices, candidates);
		if (!resolved) return false;
		if (!layoutPickBeatsSceneDistance(resolved.distance, competingSceneDistance)) return false;
		switch (resolved.selection.kind) {
			case 'room':
				selectLayoutRoom(interaction, resolved.selection.roomId);
				break;
			case 'wall':
				selectLayoutWall(interaction, resolved.selection.roomId, resolved.selection.segmentId);
				break;
			case 'opening':
				selectLayoutOpening(
					interaction,
					resolved.selection.roomId,
					resolved.selection.segmentId,
					resolved.selection.openingId
				);
				break;
			case 'interiorAnchor':
				selectLayoutInteriorAnchor(
					interaction,
					resolved.selection.roomId,
					resolved.selection.segmentId,
					resolved.selection.anchorId
				);
				break;
			case 'object':
				selectLayoutObject(interaction, resolved.selection.objectId);
				break;
			case 'none':
				break;
		}
		return true;
	}

	it('commits the resolved layout pick and reports the layout domain', () => {
		const { mesh, indices, wallTriangle } = wallFixture();
		const interaction = createLayoutInteractionState();
		const store = createMuseumEditorStore({
			document: cloneFixtureDocument(),
			rooms: chopinRuntime.rooms,
			onSelectionActivate: () => clearLayoutSelection(interaction)
		});

		const candidates: Layout3dHitCandidate[] = [
			{ kind: 'wall-triangle', roomId: mesh.roomId, triangleIndex: wallTriangle, distance: 1.5 }
		];
		expect(applyLayoutPick(interaction, indices, candidates, null)).toBe(true);
		expect(interaction.selection.kind).toBe('wall');			expect(
				deriveActiveSelection(
					'scene',
					store.selection.workspace,
					store.selection.navigation,
					interaction.selection
				)
			).toEqual({ domain: 'layout', selection: interaction.selection });
	});

	it('a nearer scene winner causes no layout write (scene wins beyond the tie band)', () => {
		const { mesh, indices, wallTriangle } = wallFixture();
		const interaction = createLayoutInteractionState();

		const candidates: Layout3dHitCandidate[] = [
			{ kind: 'wall-triangle', roomId: mesh.roomId, triangleIndex: wallTriangle, distance: 2.5 }
		];
		expect(applyLayoutPick(interaction, indices, candidates, 1)).toBe(false);
		expect(interaction.selection).toEqual({ kind: 'none' });
	});

	it('a follow-up scene pick clears the layout selection through the store hook', () => {
		const { mesh, indices, wallTriangle } = wallFixture();
		const interaction = createLayoutInteractionState();
		const store = createMuseumEditorStore({
			document: cloneFixtureDocument(),
			rooms: chopinRuntime.rooms,
			onSelectionActivate: () => clearLayoutSelection(interaction)
		});

		const candidates: Layout3dHitCandidate[] = [
			{ kind: 'wall-triangle', roomId: mesh.roomId, triangleIndex: wallTriangle, distance: 1.5 }
		];
		expect(applyLayoutPick(interaction, indices, candidates, null)).toBe(true);
		expect(interaction.selection.kind).toBe('wall');

		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(interaction.selection).toEqual({ kind: 'none' });
	});

	it('a no-hit click leaves the layout selection untouched (the normal flow owns deselect)', () => {
		const { indices } = wallFixture();
		const interaction = createLayoutInteractionState();
		expect(applyLayoutPick(interaction, indices, [], null)).toBe(false);
		expect(interaction.selection).toEqual({ kind: 'none' });
	});

	it('cross-domain yield rule: layout wins only when strictly nearer beyond eps, or scene absent', () => {
		const eps = LAYOUT_3D_SAME_DEPTH_EPSILON;

		// No actionable scene hit → layout always wins.
		expect(layoutPickBeatsSceneDistance(2, null)).toBe(true);
		// Layout clearly nearer → wins.
		expect(layoutPickBeatsSceneDistance(2, 3)).toBe(true);
		expect(layoutPickBeatsSceneDistance(1.9998, 2)).toBe(true); // Δ = 2e-4 > eps
		// Exact tie and the noise band → scene wins (content beats background).
		expect(layoutPickBeatsSceneDistance(2, 2)).toBe(false);
		expect(layoutPickBeatsSceneDistance(1.99995, 2)).toBe(false); // Δ = 5e-5 ≤ eps
		expect(layoutPickBeatsSceneDistance(2, 2 + eps)).toBe(false); // boundary
		// Layout farther → scene wins.
		expect(layoutPickBeatsSceneDistance(3, 2)).toBe(false);
	});
});

describe('follow-up — layoutSelectionKey (hover dedupe)', () => {
	it('keys every selection kind to a stable, unambiguous identity string', () => {
		expect(layoutSelectionKey(null)).toBe('');
		expect(layoutSelectionKey({ kind: 'none' })).toBe('none');
		expect(layoutSelectionKey({ kind: 'room', roomId: 'r1' })).toBe('room:r1');
		expect(layoutSelectionKey({ kind: 'wall', roomId: 'r1', segmentId: 'r1:wall:0' })).toBe(
			'wall:r1:r1:wall:0'
		);
		expect(
			layoutSelectionKey({
				kind: 'opening',
				roomId: 'r1',
				segmentId: 'r1:wall:0',
				openingId: 'door-1'
			})
		).toBe('opening:r1:r1:wall:0:door-1');
		expect(
			layoutSelectionKey({
				kind: 'interiorAnchor',
				roomId: 'r1',
				segmentId: 'r1:wall:0',
				anchorId: 'a1'
			})
		).toBe('anchor:r1:r1:wall:0:a1');
		expect(layoutSelectionKey({ kind: 'object', objectId: 'obj-box' })).toBe('object:obj-box');
	});

	it('distinguishes identities that differ only in one qualifier', () => {
		const wallA = layoutSelectionKey({ kind: 'wall', roomId: 'r1', segmentId: 'r1:wall:0' });
		const wallB = layoutSelectionKey({ kind: 'wall', roomId: 'r1', segmentId: 'r1:wall:1' });
		const wallInRoom2 = layoutSelectionKey({ kind: 'wall', roomId: 'r2', segmentId: 'r1:wall:0' });

		expect(wallA).not.toBe(wallB);
		expect(wallA).not.toBe(wallInRoom2);
		// An opening never collides with the wall it sits on (the extra
		// `:openingId` segment keeps the keys disjoint).
		expect(
			layoutSelectionKey({
				kind: 'opening',
				roomId: 'r1',
				segmentId: 'r1:wall:0',
				openingId: 'door-1'
			})
		).not.toBe(wallA);
	});
});

describe('deferral — isLayoutDirectPickDeferred', () => {
	it('defers direct wall and interior-anchor picks', () => {
		expect(isLayoutDirectPickDeferred({ kind: 'wall', roomId: 'r1', segmentId: 'r1:wall:0' })).toBe(true);
		expect(
			isLayoutDirectPickDeferred({
				kind: 'interiorAnchor',
				roomId: 'r1',
				segmentId: 'r1:wall:0',
				anchorId: 'a1'
			})
		).toBe(true);
	});

	it('keeps room, opening, object, and none directly pickable', () => {
		expect(isLayoutDirectPickDeferred({ kind: 'none' })).toBe(false);
		expect(isLayoutDirectPickDeferred({ kind: 'room', roomId: 'r1' })).toBe(false);
		expect(
			isLayoutDirectPickDeferred({
				kind: 'opening',
				roomId: 'r1',
				segmentId: 'r1:wall:0',
				openingId: 'door-1'
			})
		).toBe(false);
		expect(isLayoutDirectPickDeferred({ kind: 'object', objectId: 'obj-box' })).toBe(false);
	});
});
