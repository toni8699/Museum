/**
 * step 1 — pure layout candidate derivation + validation pipeline.
 *
 * Consumes the S7 descriptor/delta seams and produces a validated transient
 * candidate bundle that the layout adapter previews and, on pointer-up,
 * installs atomically. Renderer-neutral: no Three/Svelte/DOM, no store —
 * testable with plain `LayoutDocument` fixtures.
 *
 * `deriveLayoutCandidate` is the single validation gate: structural
 * (`validateLayoutDocument`) → geometry (`validateLayoutDocumentGeometry` +
 * `hasBlockingLayoutIssues`) → compile (`buildLayoutPreviewModel`) → wall-mesh
 * preflight (`buildWallMeshesByRoom`), reusing `derivePreviewBundle`'s
 * ordering so the transient preview and the commit install use the identical
 * gate. It never throws — a caught `derivePreviewBundle` failure maps to
 * `{ bundle: null, issue }` and the adapter keeps the last valid bundle.
 */

import type { MuseumProject } from '$lib/editor/project/project-types';
import type {
	LayoutDocument,
	LayoutOpening,
	LayoutRoom,
	LayoutVec2
} from '$lib/layout/layout-types';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
import type { LayoutGeometryIssue } from '$lib/layout/layout-geometry-types';
import { validateLayoutDocument } from '$lib/layout/layout-codec';
import type { IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
import type { LayoutPreviewModel } from '../layout/layout-mesh-factory';
import type { LayoutPreviewBounds } from '../layout/layout-preview-bounds';
import type { Layout3dPickIndex } from '../layout/layout-3d-picking';
import { hasBlockingLayoutIssues, validateLayoutDocumentGeometry } from '../layout/layout-validation';
import { derivePreviewBundle } from '../layout/layout-preview-state.svelte';
import { transformLayoutRoomUnit } from '../layout/layout-room-transform';
import { updateInteriorAnchorOnSegment } from '../layout/layout-editing';
import { patchLayoutObject } from '../layout/layout-object-editing';
import { segmentLength } from '../layout/curve-geometry';
import type {
	LayoutGizmoDelta,
	LayoutGizmoTargetDescriptor
} from './layout-gizmo-target';

/**
 * One validated transient candidate: the project (layout swapped), the
 * compiled model/geometry, the wall-mesh + pick caches, and the candidate
 * `LayoutDocument`. `bounds` is carried so the commit install can update the
 * full `LayoutPreviewState` in one shot.
 */
export type LayoutGizmoCandidateBundle = {
	project: MuseumProject;
	model: LayoutPreviewModel;
	geometry: CompiledLayoutGeometry;
	wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
	layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>;
	issues: LayoutGeometryIssue[];
	bounds: LayoutPreviewBounds | null;
	/** The validated candidate document (== `project.layout`). */
	layout: LayoutDocument;
};

function findRoom(
	document: LayoutDocument,
	roomId: string
): { floor: LayoutDocument['floors'][number]; room: LayoutRoom } | null {
	for (const floor of document.floors) {
		const room = floor.rooms.find((candidate) => candidate.id === roomId);
		if (room) return { floor, room };
	}
	return null;
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Translate one wall (and its interior anchors) by `delta`, moving the two
 * adjacent walls' shared corner endpoints by the same `delta` so closure stays
 * exact. Boundary-only edit — the authored room frame is untouched, matching
 * the `replaceRoomPoints`/vertex-edit convention. Returns `null` when the
 * room/segment is missing or the delta is non-finite.
 */
export function translateWallUnit(
	document: LayoutDocument,
	roomId: string,
	segmentId: string,
	delta: LayoutVec2
): LayoutDocument | null {
	if (!delta.every(Number.isFinite)) return null;
	if (!findRoom(document, roomId)) return null;
	const next = cloneJson(document);
	const found = findRoom(next, roomId);
	if (!found) return null;
	const segments = found.room.boundary.segments;
	const index = segments.findIndex((segment) => segment.id === segmentId);
	if (index < 0) return null;
	const count = segments.length;
	const add = (point: LayoutVec2): LayoutVec2 => [point[0] + delta[0], point[1] + delta[1]];
	const previousIndex = (index - 1 + count) % count;
	const nextIndex = (index + 1) % count;
	const nextSegments = segments.map((segment, currentIndex) => {
		if (currentIndex === index) {
			const moved = { ...segment, start: add(segment.start), end: add(segment.end) };
			if (segment.kind === 'auto-bezier') {
				return {
					...moved,
					interiorAnchors: segment.interiorAnchors.map((anchor) => ({
						...anchor,
						point: add(anchor.point)
					}))
				};
			}
			return moved;
		}
		if (currentIndex === previousIndex) {
			// Previous wall shares the selected wall's start corner.
			return { ...segment, end: add(segment.end) };
		}
		if (currentIndex === nextIndex) {
			// Next wall shares the selected wall's end corner.
			return { ...segment, start: add(segment.start) };
		}
		return segment;
	});
	found.room.boundary = { ...found.room.boundary, segments: nextSegments };
	return next;
}

/** Recompute an opening from the baseline + delta (translate local X, scale x/y). */
function buildOpeningCandidate(
	descriptor: LayoutGizmoTargetDescriptor,
	delta: LayoutGizmoDelta,
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry
): LayoutDocument | null {
	if (delta.kind !== 'opening' || descriptor.baseline.kind !== 'opening') return null;
	const selection = descriptor.selection;
	if (selection.kind !== 'opening') return null;
	const found = findRoom(layout, selection.roomId);
	const opening = found?.room.openings.find(
		(candidate) =>
			candidate.id === selection.openingId && candidate.segmentId === selection.segmentId
	);
	const segment = found?.room.boundary.segments.find(
		(candidate) => candidate.id === selection.segmentId
	);
	if (!found || !opening || !segment) return null;
	if (!Number.isFinite(delta.centerShiftX) || !Number.isFinite(delta.width) || !Number.isFinite(delta.height)) {
		return null;
	}
	// Offset/width clamp to the compiled wall length (fallback: authored arc).
	const compiledRoom = geometry.rooms.find((room) => room.roomId === selection.roomId);
	const compiledWall = compiledRoom?.walls.find((wall) => wall.segmentId === selection.segmentId);
	const segLen = compiledWall?.length ?? segmentLength(segment);
	const width = clamp(Math.max(0, delta.width), 0, segLen);
	const height = Math.max(0, delta.height);
	const center = opening.offset + opening.width / 2 + delta.centerShiftX;
	const offset = clamp(center - width / 2, 0, Math.max(0, segLen - width));
	const nextOpening: LayoutOpening = { ...opening, offset, width, height };
	const nextRoom: LayoutRoom = {
		...found.room,
		openings: found.room.openings.map((candidate) =>
			candidate.id === selection.openingId ? nextOpening : candidate
		)
	};
	const next = cloneJson(layout);
	const nextFound = findRoom(next, selection.roomId);
	if (!nextFound) return null;
	nextFound.floor.rooms = nextFound.floor.rooms.map((room) =>
		room.id === selection.roomId ? nextRoom : room
	);
	return next;
}

/** Move one interior anchor to `baseline.point + delta`. */
function buildInteriorAnchorCandidate(
	descriptor: LayoutGizmoTargetDescriptor,
	delta: LayoutGizmoDelta,
	layout: LayoutDocument
): LayoutDocument | null {
	if (delta.kind !== 'interiorAnchor' || descriptor.baseline.kind !== 'interiorAnchor') return null;
	const selection = descriptor.selection;
	if (selection.kind !== 'interiorAnchor') return null;
	const found = findRoom(layout, selection.roomId);
	const segment = found?.room.boundary.segments.find(
		(candidate) => candidate.id === selection.segmentId
	);
	if (!found || !segment || segment.kind !== 'auto-bezier') return null;
	const nextPoint: LayoutVec2 = [
		descriptor.baseline.point[0] + delta.translation[0],
		descriptor.baseline.point[1] + delta.translation[1]
	];
	const nextSegment = updateInteriorAnchorOnSegment(segment, selection.anchorId, nextPoint);
	const nextRoom: LayoutRoom = {
		...found.room,
		boundary: {
			...found.room.boundary,
			segments: found.room.boundary.segments.map((candidate) =>
				candidate.id === selection.segmentId ? nextSegment : candidate
			)
		}
	};
	const next = cloneJson(layout);
	const nextFound = findRoom(next, selection.roomId);
	if (!nextFound) return null;
	nextFound.floor.rooms = nextFound.floor.rooms.map((room) =>
		room.id === selection.roomId ? nextRoom : room
	);
	return next;
}

/** Patch one layout object from the baseline + delta (position/rotation deltas, dimensions absolute). */
function buildObjectCandidate(
	descriptor: LayoutGizmoTargetDescriptor,
	delta: LayoutGizmoDelta,
	layout: LayoutDocument
): LayoutDocument | null {
	if (delta.kind !== 'object' || descriptor.baseline.kind !== 'object') return null;
	const selection = descriptor.selection;
	if (selection.kind !== 'object') return null;
	const baseline = descriptor.baseline;
	return patchLayoutObject(layout, selection.objectId, {
		position: [
			baseline.position[0] + delta.position[0],
			baseline.position[1] + delta.position[1],
			baseline.position[2] + delta.position[2]
		],
		rotation: [
			baseline.rotation[0] + delta.rotation[0],
			baseline.rotation[1] + delta.rotation[1],
			baseline.rotation[2] + delta.rotation[2]
		],
		dimensions: [...delta.dimensions]
	});
}

/** Build the candidate document for a delta; `issue` carries the room-transform rejection. */
function buildCandidateDocument(
	descriptor: LayoutGizmoTargetDescriptor,
	delta: LayoutGizmoDelta,
	layout: LayoutDocument,
	geometry: CompiledLayoutGeometry
): { document: LayoutDocument | null; issue: string | null } {
	switch (delta.kind) {
		case 'room': {
			if (descriptor.selection.kind !== 'room') return { document: null, issue: null };
			const result = transformLayoutRoomUnit(layout, descriptor.selection.roomId, {
				translation: delta.translation,
				yaw: delta.yaw
			});
			return result.success
				? { document: result.document, issue: null }
				: { document: null, issue: result.message };
		}
		case 'wall': {
			if (descriptor.selection.kind !== 'wall') return { document: null, issue: null };
			return {
				document: translateWallUnit(
					layout,
					descriptor.selection.roomId,
					descriptor.selection.segmentId,
					delta.translation
				),
				issue: null
			};
		}
		case 'opening':
			return { document: buildOpeningCandidate(descriptor, delta, layout, geometry), issue: null };
		case 'interiorAnchor':
			return { document: buildInteriorAnchorCandidate(descriptor, delta, layout), issue: null };
		case 'object':
			return { document: buildObjectCandidate(descriptor, delta, layout), issue: null };
	}
}

/**
 * The single validation gate: build the candidate document, then run
 * structural → geometry → compile → wall-mesh preflight. Returns the candidate
 * bundle or `null` + the first blocking issue. Never throws.
 */
export function deriveLayoutCandidate(
	descriptor: LayoutGizmoTargetDescriptor,
	delta: LayoutGizmoDelta,
	layout: LayoutDocument,
	scene: MuseumProject['scene'],
	geometry: CompiledLayoutGeometry,
	projectId: string,
	projectName: string
): { bundle: LayoutGizmoCandidateBundle | null; issue: string | null } {
	const built = buildCandidateDocument(descriptor, delta, layout, geometry);
	if (!built.document) {
		return { bundle: null, issue: built.issue ?? 'Could not build the layout candidate' };
	}
	const structural = validateLayoutDocument(built.document);
	if (!structural.success) {
		return { bundle: null, issue: structural.issues[0]?.message ?? 'Candidate layout is structurally invalid' };
	}
	const geometryIssues = validateLayoutDocumentGeometry(structural.document);
	if (hasBlockingLayoutIssues(geometryIssues)) {
		return { bundle: null, issue: geometryIssues[0]?.message ?? 'Candidate layout has invalid geometry' };
	}
	try {
		const preview = derivePreviewBundle(projectId, projectName, structural.document, scene);
		return {
			bundle: {
				project: preview.project,
				model: preview.model,
				geometry: preview.geometry,
				wallMeshesByRoom: preview.wallMeshesByRoom,
				layout3dPickIndexByRoom: preview.layout3dPickIndexByRoom,
				issues: preview.issues,
				bounds: preview.bounds,
				layout: structural.document
			},
			issue: null
		};
	} catch (error) {
		return {
			bundle: null,
			issue: error instanceof Error ? error.message : 'Could not compile the layout candidate'
		};
	}
}
