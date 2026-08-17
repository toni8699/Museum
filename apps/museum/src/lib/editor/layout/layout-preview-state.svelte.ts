import { chopinProject, museumSceneDocument } from '$lib/content/chopin-project';
import { createEmptySceneDocument, type MuseumSceneDocument } from '$lib/content/scene';
import type { MuseumProject } from '$lib/editor/project/project-types';
import {
	createEmptyLayoutDocument,
	parseLayoutDocumentJson,
	serializeLayoutDocument,
	validateLayoutDocument	} from '$lib/layout/layout-codec';
	import { buildLayoutPreviewModel, type LayoutPreviewModel, type LayoutPreviewModelResult } from './layout-mesh-factory';
import type { LayoutPreviewBounds } from './layout-preview-bounds';
import type { DraftSegment, LayoutObject, LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';
import { deleteInteriorAnchorOnSegment, insertInteriorAnchorOnSegment, pointInRoom, replaceRoomPoints, updateInteriorAnchorOnSegment } from './layout-editing';
import {
	appendRoomOpening,
	createDefaultOpening,
	findRoomOpening,
	nextOpeningId,
	removeRoomOpening,
	replaceRoomOpening,
	type LayoutOpeningKind,
	type LayoutOpeningPatch
} from './layout-opening-editing';
import { hasBlockingLayoutIssues, validateLayoutDocumentGeometry, validateLineRoom, type LayoutGeometryIssue } from './layout-validation';
import { deleteLayoutRoom as deleteRoomFromDocument } from './layout-room-editing';
import {
	createLayoutObject,
	defaultLayoutObjectDimensions,
	deleteLayoutObject as deleteObjectFromDocument,
	isKnownLayoutRoomId,
	nextLayoutObjectId,
	patchLayoutObject,
	primitiveObjectGeometry,
	type AuthoredLayoutObjectKind,
	type LayoutObjectPatch
} from './layout-object-editing';
import type { Vec3 } from '$lib/types/museum';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
import { buildRoomWallMesh, type IndexedWallMesh } from '$lib/layout/wall-mesh-builder';
import { buildLayout3dTriangleIndex, type Layout3dPickIndex } from './layout-3d-picking';
import { transformLayoutRoomUnit, type LayoutRoomUnitTransform } from './layout-room-transform';
import { deriveLayoutRoomFrame } from '$lib/layout/layout-room-frame';
// H1 S8 — type-only (erased at runtime; the candidate module imports
// `derivePreviewBundle` from here as its only value dependency).
import type { LayoutGizmoCandidateBundle } from '../gizmo/layout-gizmo-candidate';

export type LayoutPreviewSource = 'chopin-fixture' | 'empty' | 'draft' | 'imported';
export type LayoutBaselineKind = 'blank' | 'imported';
export type LayoutSessionStatus = 'blank' | 'dirty' | 'imported';

export type LayoutPreviewState = {
	source: LayoutPreviewSource;
	project: MuseumProject;
	model: LayoutPreviewModel;
	geometry: CompiledLayoutGeometry;
	/**
	 * Derived cache: one prebuilt `IndexedWallMesh` per compiled room, keyed by
	 * `roomId`. A `Map` (not a plain object) so valid IDs like `constructor`
	 * cannot collide with prototype keys. Rebuilds with `geometry` on every
	 * mutation and is *not* part of the undo snapshot. The scene renders only
	 * these prebuilt meshes — it never builds geometry inline.
	 */
	wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
	/**
	 * H1 S5 — triangle reverse index per compiled room, built once per mesh
	 * generation beside `wallMeshesByRoom` (same lifecycle, never in the undo
	 * snapshot). S6's 3D selection coordinator resolves raycast hit triangles
	 * through it instead of re-walking `pickRanges` per hit.
	 */
	layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>;
	issues: LayoutGeometryIssue[];
	bounds: LayoutPreviewBounds | null;
	previewVersion: number;
	reframeVersion: number;
	showCeilings: boolean;
	lastMutationMessage: string | null;
	statusMessage: string | null;
	importError: string | null;
	baselineLayoutJson: string;
	baselineKind: LayoutBaselineKind;
};

export type LayoutDraftCommitResult =
	| { success: true; roomId: string }
	| { success: false; message: string };

export type LayoutRoomEditResult =
	| { success: true }
	| { success: false; message: string };

export type LayoutInteriorAnchorMutationResult =
	| { success: true; anchorId: string }
	| { success: false; message: string };

export type LayoutOpeningMutationResult =
	| { success: true; openingId: string }
	| { success: false; message: string };

export type LayoutObjectMutationResult =
	| { success: true; objectId: string }
	| { success: false; message: string };

export type LayoutRoomFieldPatch = Partial<
	Pick<LayoutRoom, 'name' | 'wallThickness' | 'floorThickness' | 'ceilingThickness'>
> & { floorHeight?: number };

export function createLayoutPreviewState(): LayoutPreviewState {
	return createState('chopin-fixture', chopinProject.layout, museumSceneDocument, 0);
}

/**
 * H1 S2 — boot a blank layout surface (`baselineKind: 'blank'`, empty layout +
 * empty scene) for the boot-into-empty editor. The Chopin-fixture default
 * (`createLayoutPreviewState`) remains the frozen relic's boot source.
 */
export function createEmptyLayoutPreviewState(): LayoutPreviewState {
	return createState('empty', createEmptyLayoutDocument(), createEmptySceneDocument(), 0);
}

export function layoutPreviewSourceLabel(source: LayoutPreviewSource): string {
	switch (source) {
		case 'chopin-fixture':
			return 'Chopin fixture';
		case 'empty':
			return 'Empty layout';
		case 'draft':
			return 'Draft layout';
		case 'imported':
			return 'Imported layout';
	}
}

/** Derived — do not store on `$state` objects (getters break Svelte 5 proxies). */
export function layoutPreviewIsDirty(state: LayoutPreviewState): boolean {
	return serializeLayoutDocument(state.project.layout) !== state.baselineLayoutJson;
}

export function layoutPreviewSessionStatus(state: LayoutPreviewState): LayoutSessionStatus {
	return layoutPreviewIsDirty(state) ? 'dirty' : state.baselineKind;
}

export function layoutPreviewStatusLabel(state: LayoutPreviewState): string {
	const status = layoutPreviewSessionStatus(state);
	return status === 'dirty' ? 'Unsaved' : status === 'blank' ? 'Blank' : 'Imported';
}

export function layoutPreviewCanonicalJson(state: LayoutPreviewState): string {
	return serializeLayoutDocument(state.project.layout);
}

/**
 * Preflight the procedural wall meshes for every compiled room. Failed rooms
 * yield structured issues (no mesh) that the editor surfaces in
 * `layoutPreview.issues`; the scene renders only rooms that built a mesh.
 */
function buildWallMeshesByRoom(geometry: CompiledLayoutGeometry): {
	wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
	layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>;
	issues: LayoutGeometryIssue[];
} {
	const wallMeshesByRoom = new Map<string, IndexedWallMesh>();
	const layout3dPickIndexByRoom = new Map<string, Layout3dPickIndex>();
	const issues: LayoutGeometryIssue[] = [];
	for (const room of geometry.rooms) {
		const result = buildRoomWallMesh(room);
		if (result.mesh) {
			wallMeshesByRoom.set(room.roomId, result.mesh);
			// Built once per mesh generation (H1 S5). A partition violation throws
			// here — fail-closed, mirroring the builder's own reject-with-issues.
			layout3dPickIndexByRoom.set(room.roomId, buildLayout3dTriangleIndex(result.mesh));
		}
		issues.push(...result.issues);
	}
	return { wallMeshesByRoom, layout3dPickIndexByRoom, issues };
}

/**
 * Apply a fresh compile result to the state and rebuild the derived wall-mesh
 * cache, merging any mesh issues into `state.issues`.
 */
function applyCompiledLayout(state: LayoutPreviewState, result: LayoutPreviewModelResult): void {
	const meshes = buildWallMeshesByRoom(result.geometry);
	const issues = meshes.issues.length > 0 ? [...result.issues, ...meshes.issues] : result.issues;
	state.model = result.model;
	state.geometry = result.geometry;
	state.issues = issues;
	state.bounds = result.bounds;
	state.wallMeshesByRoom = meshes.wallMeshesByRoom;
	state.layout3dPickIndexByRoom = meshes.layout3dPickIndexByRoom;
}

/**
 * Fully derive the preview bundle for a candidate layout: validated project +
 * compiled model + geometry + wall-mesh preflight. Throws on any failure so
 * callers commit the result atomically — a caught error must leave the
 * committed `LayoutPreviewState` untouched (no stale model/geometry paired
 * with a new project).
 */
export function derivePreviewBundle(
	projectId: string,
	projectName: string,
	layout: MuseumProject['layout'],
	scene: MuseumProject['scene']
): {
	project: MuseumProject;
	model: LayoutPreviewModel;
	geometry: CompiledLayoutGeometry;
	wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
	layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>;
	issues: LayoutGeometryIssue[];
	bounds: LayoutPreviewBounds | null;
} {
	const project = createPreviewProject({ id: projectId, name: projectName, layout, scene });
	const result = buildLayoutPreviewModel(project.layout);
	const meshes = buildWallMeshesByRoom(result.geometry);
	return {
		project,
		model: result.model,
		geometry: result.geometry,
		wallMeshesByRoom: meshes.wallMeshesByRoom,
		layout3dPickIndexByRoom: meshes.layout3dPickIndexByRoom,
		issues: meshes.issues.length > 0 ? [...result.issues, ...meshes.issues] : result.issues,
		bounds: result.bounds
	};
}

/** Install a derived bundle in one shot; never partially mutates committed state. */
function commitPreviewBundle(state: LayoutPreviewState, bundle: ReturnType<typeof derivePreviewBundle>): void {
	state.project = bundle.project;
	state.model = bundle.model;
	state.geometry = bundle.geometry;
	state.wallMeshesByRoom = bundle.wallMeshesByRoom;
	state.layout3dPickIndexByRoom = bundle.layout3dPickIndexByRoom;
	state.issues = bundle.issues;
	state.bounds = bundle.bounds;
}

/**
 * H1 S8 — install the layout adapter's last-valid candidate in one shot
 * (the same field set `commitPreviewBundle` writes, plus the session
 * bookkeeping the Plan mutators bump). The candidate was already derived
 * through `derivePreviewBundle`, so this never re-validates and never throws.
 */
export function commitLayoutCandidate(
	state: LayoutPreviewState,
	bundle: LayoutGizmoCandidateBundle
): void {
	state.project = bundle.project;
	state.model = bundle.model;
	state.geometry = bundle.geometry;
	state.wallMeshesByRoom = bundle.wallMeshesByRoom;
	state.layout3dPickIndexByRoom = bundle.layout3dPickIndexByRoom;
	state.issues = bundle.issues;
	state.bounds = bundle.bounds;
	state.previewVersion += 1;
	state.lastMutationMessage = null;
	state.statusMessage = null;
	state.importError = null;
}

/** Report a failed layout import without changing the committed preview or baseline. */
export function setLayoutPreviewImportError(state: LayoutPreviewState, message: string): void {
	state.importError = message;
	state.statusMessage = `Import failed: ${message}`;
}

export function loadChopinLayoutPreview(state: LayoutPreviewState): boolean {
	replaceState(
		state,
		createState('chopin-fixture', chopinProject.layout, state.project.scene, state.previewVersion)
	);
	return true;
}

export function resetLayoutPreview(state: LayoutPreviewState): boolean {
	replaceState(
		state,
		createState('empty', createEmptyLayoutDocument(), state.project.scene, state.previewVersion)
	);
	return true;
}

export function refreshLayoutPreview(state: LayoutPreviewState): boolean {
	applyCompiledLayout(state, buildLayoutPreviewModel(state.project.layout));
	state.previewVersion += 1;
	state.lastMutationMessage = null;
	state.statusMessage = null;
	state.importError = null;
	return true;
}

export function toggleLayoutCeilings(state: LayoutPreviewState): void {
	state.showCeilings = !state.showCeilings;
}

export function importLayoutPreviewJson(state: LayoutPreviewState, json: string): boolean {
	const parsed = parseLayoutDocumentJson(json);
	if (!parsed.success) {
		setLayoutPreviewImportError(state, parsed.issues[0]?.message ?? 'Invalid layout document');
		return false;
	}
	try {
		const bundle = derivePreviewBundle(state.project.id, state.project.name, parsed.document, state.project.scene);
		state.source = 'imported';
		commitPreviewBundle(state, bundle);
		state.previewVersion += 1;
		state.reframeVersion += 1;
		state.baselineLayoutJson = parsed.canonicalJson;
		state.baselineKind = 'imported';
		state.lastMutationMessage = null;
		state.statusMessage = 'Imported layout JSON';
		state.importError = null;
		return true;
	} catch (error) {
		setLayoutPreviewImportError(state, error instanceof Error ? error.message : 'Could not import layout');
		return false;
	}
}	export function updateLayoutRoomFields(
		state: LayoutPreviewState,
		roomId: string,
		patch: LayoutRoomFieldPatch
	): LayoutRoomEditResult {
		const layout = cloneLayout(state.project.layout);
		const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
		const room = floor?.rooms.find((candidate) => candidate.id === roomId);
		if (!floor || !room) return failRoomEdit(state, 'Room no longer exists');
		if (patch.name !== undefined && patch.name.trim().length === 0) {
			return failRoomEdit(state, 'Room name cannot be empty');
		}
		const nextRoom: LayoutRoom = {
			...room,
			...(patch.name === undefined ? {} : { name: patch.name.trim() }),
			...(patch.wallThickness === undefined ? {} : { wallThickness: patch.wallThickness }),
			...(patch.floorThickness === undefined ? {} : { floorThickness: patch.floorThickness }),
			...(patch.ceilingThickness === undefined ? {} : { ceilingThickness: patch.ceilingThickness })
		};
		floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
		if (patch.floorHeight !== undefined) floor.height = patch.floorHeight;
		const applied = applyLayoutMutation(state, layout);
		return applied.success ? { success: true } : applied;
	}

/** Per-kind counts of scene content referencing a layout room. */
export type LayoutRoomSceneReferences = {
	entities: number;
	clusters: number;
	navigationNodes: number;
	pathAnchors: number;
	waypoints: number;
	viewKeyframes: number;
};

/**
 * Count every `project.scene` reference to a layout room. Mirrors the
 * `unknown_room` cross-validation surface of `validateProjectSceneRooms` so
 * the reject-when-referenced policy and the project codec agree on what
 * counts as a reference.
 */
export function listLayoutRoomSceneReferences(
	scene: MuseumSceneDocument,
	roomId: string
): LayoutRoomSceneReferences {
	let entities = 0;
	let clusters = 0;
	let navigationNodes = 0;
	let pathAnchors = 0;
	let waypoints = 0;
	let viewKeyframes = 0;
	for (const entity of scene.entities) {
		if (entity.roomId === roomId) entities += 1;
	}
	for (const cluster of scene.clusters ?? []) {
		if (cluster.roomId === roomId) clusters += 1;
	}
	for (const node of scene.navigationNodes) {
		if (node.roomId === roomId) navigationNodes += 1;
	}
	for (const connection of scene.connections) {
		for (const anchor of connection.positionPath.anchors) {
			if (anchor.roomId === roomId) pathAnchors += 1;
		}
		for (const waypoint of connection.targetWaypoints ?? []) {
			if (waypoint.roomId === roomId) waypoints += 1;
		}
		for (const direction of ['forward', 'reverse'] as const) {
			for (const keyframe of connection.viewTracks?.[direction] ?? []) {
				if (keyframe.roomId === roomId) viewKeyframes += 1;
			}
		}
	}
	return { entities, clusters, navigationNodes, pathAnchors, waypoints, viewKeyframes };
}

export function layoutRoomSceneReferenceTotal(refs: LayoutRoomSceneReferences): number {
	return (
		refs.entities +
		refs.clusters +
		refs.navigationNodes +
		refs.pathAnchors +
		refs.waypoints +
		refs.viewKeyframes
	);
}

/** "3 entities · 1 camera node" — the blocker summary shown to the user. */
export function layoutRoomSceneReferenceSummary(refs: LayoutRoomSceneReferences): string {
	const parts: string[] = [];
	if (refs.entities > 0) parts.push(`${refs.entities} entit${refs.entities === 1 ? 'y' : 'ies'}`);
	if (refs.clusters > 0) parts.push(`${refs.clusters} cluster${refs.clusters === 1 ? '' : 's'}`);
	if (refs.navigationNodes > 0) parts.push(`${refs.navigationNodes} camera node${refs.navigationNodes === 1 ? '' : 's'}`);
	if (refs.pathAnchors > 0) parts.push(`${refs.pathAnchors} path anchor${refs.pathAnchors === 1 ? '' : 's'}`);
	if (refs.waypoints > 0) parts.push(`${refs.waypoints} waypoint${refs.waypoints === 1 ? '' : 's'}`);
	if (refs.viewKeyframes > 0) parts.push(`${refs.viewKeyframes} view keyframe${refs.viewKeyframes === 1 ? '' : 's'}`);
	return parts.join(' · ');
}

/**
 * H1 S2.1 — delete a layout room (reject-when-referenced policy).
 *
 * The caller passes the authoritative scene document (the editor store's
 * document, which owns scene authoring in the H1 shell) — NOT
 * `state.project.scene`, a boot-time copy that never syncs with scene edits.
 * The delete is blocked while any scene content references the room; a
 * successful delete cascades layout-internal content only (room + owned
 * objects + portal refs) and rides the standard `applyLayoutMutation` gate
 * (strict codec + geometry + wall-mesh preflight).
 */
export function deleteLayoutRoom(
	state: LayoutPreviewState,
	roomId: string,
	scene: MuseumSceneDocument
): LayoutRoomEditResult {
	const refs = listLayoutRoomSceneReferences(scene, roomId);
	if (layoutRoomSceneReferenceTotal(refs) > 0) {
		return failRoomEdit(
			state,
			`Room is referenced by scene content (${layoutRoomSceneReferenceSummary(refs)}); move or delete it first`
		);
	}
	const layout = deleteRoomFromDocument(cloneLayout(state.project.layout), roomId);
	if (!layout) return failRoomEdit(state, 'Room no longer exists');
	const applied = applyLayoutMutation(state, layout);
	return applied.success ? { success: true } : applied;
}

export function commitLayoutPrimitive(
	state: LayoutPreviewState,
	kind: Exclude<AuthoredLayoutObjectKind, 'plane'>,
	start: LayoutVec2,
	current: LayoutVec2,
	roomId: string | undefined,
	snapEnabled = false
): LayoutObjectMutationResult {
	const floor = state.project.layout.floors[0];
	if (!floor || !roomId) return failObjectMutation(state, 'Choose a first-floor room');
	const geometry = primitiveObjectGeometry(kind, start, current, floor.elevation, snapEnabled);
	if (!geometry) return failObjectMutation(state, 'Primitive gesture must have a non-zero size');
	const room = floor.rooms.find((candidate) => candidate.id === roomId);
	const center: LayoutVec2 = [geometry.position[0], geometry.position[2]];
	if (!room || !pointInRoom(center, room)) {
		return failObjectMutation(state, 'Choose a first-floor room');
	}
	const layout = cloneLayout(state.project.layout);
	const object = createLayoutObject({
		id: nextLayoutObjectId(layout.objects),
		kind,
		position: geometry.position,
		dimensions: geometry.dimensions,
		roomId
	});
	layout.objects = [...layout.objects, object];
	const applied = applyLayoutMutation(state, layout);
	return applied.success ? { success: true, objectId: object.id } : applied;
}

export function commitLayoutObject(
	state: LayoutPreviewState,
	kind: AuthoredLayoutObjectKind,
	position: Vec3,
	roomId?: string
): LayoutObjectMutationResult {
	if (!position.every(Number.isFinite)) return failObjectMutation(state, 'Object position must be finite');
	if (!isKnownLayoutRoomId(state.project.layout, roomId)) {
		return failObjectMutation(state, `Unknown roomId '${roomId}'`);
	}
	const layout = cloneLayout(state.project.layout);
	const object = createLayoutObject({
		id: nextLayoutObjectId(layout.objects),
		kind,
		position,
		dimensions: defaultLayoutObjectDimensions(kind),
		...(roomId ? { roomId } : {})
	});
	layout.objects = [...layout.objects, object];
	const applied = applyLayoutMutation(state, layout);
	return applied.success ? { success: true, objectId: object.id } : applied;
}

export function updateLayoutObjectFields(
	state: LayoutPreviewState,
	objectId: string,
	patch: LayoutObjectPatch
): LayoutObjectMutationResult {
	const current = state.project.layout.objects.find((object) => object.id === objectId);
	if (!current) return failObjectMutation(state, 'Object no longer exists');
	if (current.kind === 'profile') return failObjectMutation(state, 'Profile objects are read-only');
	if ('roomId' in patch && !isKnownLayoutRoomId(state.project.layout, patch.roomId)) {
		return failObjectMutation(state, `Unknown roomId '${patch.roomId}'`);
	}
	const layout = patchLayoutObject(cloneLayout(state.project.layout), objectId, patch);
	if (!layout) return failObjectMutation(state, 'Object no longer exists');
	const applied = applyLayoutMutation(state, layout);
	return applied.success ? { success: true, objectId } : applied;
}

export function deleteLayoutObject(
	state: LayoutPreviewState,
	objectId: string
): LayoutObjectMutationResult {
	const current = state.project.layout.objects.find((object) => object.id === objectId);
	if (!current) return failObjectMutation(state, 'Object no longer exists');
	if (current.kind === 'profile') return failObjectMutation(state, 'Profile objects are read-only');
	const layout = deleteObjectFromDocument(cloneLayout(state.project.layout), objectId);
	if (!layout) return failObjectMutation(state, 'Object no longer exists');
	const applied = applyLayoutMutation(state, layout);
	return applied.success ? { success: true, objectId } : applied;
}

export function commitLayoutOpening(
	state: LayoutPreviewState,
	roomId: string,
	segmentId: string,
	kind: LayoutOpeningKind,
	clickOffset: number,
	snapEnabled = true
): LayoutOpeningMutationResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	const segment = room?.boundary.segments.find((candidate) => candidate.id === segmentId);
	if (!floor || !room || !segment) {
		return failOpeningMutation(state, 'Wall no longer exists');
	}
	const opening: LayoutOpening = createDefaultOpening({
		id: nextOpeningId(room, kind),
		segment,
		kind,
		clickOffset,
		snapEnabled
	});
	const nextRoom = appendRoomOpening(room, opening);
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failOpeningMutation(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	return applyLayoutMutation(state, layout, opening.id);
}

export function updateLayoutOpeningFields(
	state: LayoutPreviewState,
	roomId: string,
	openingId: string,
	patch: LayoutOpeningPatch
): LayoutOpeningMutationResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	const opening = room ? findRoomOpening(room, openingId) : undefined;
	if (!floor || !room || !opening) return failOpeningMutation(state, 'Opening no longer exists');
	const nextOpening = { ...opening, ...patch };
	const nextRoom = replaceRoomOpening(room, nextOpening);
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failOpeningMutation(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	return applyLayoutMutation(state, layout, openingId);
}

export function deleteLayoutOpening(
	state: LayoutPreviewState,
	roomId: string,
	openingId: string
): LayoutOpeningMutationResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	if (!floor || !room || !findRoomOpening(room, openingId)) return failOpeningMutation(state, 'Opening no longer exists');
	const nextRoom = removeRoomOpening(room, openingId);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	return applyLayoutMutation(state, layout, openingId);
}

export function insertLayoutWallInteriorAnchor(
	state: LayoutPreviewState,
	roomId: string,
	segmentId: string,
	point: LayoutVec2
): LayoutInteriorAnchorMutationResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	const segment = room?.boundary.segments.find((candidate) => candidate.id === segmentId);
	if (!floor || !room || !segment) return failInteriorAnchorMutation(state, 'Wall no longer exists');
	const existingIds = new Set(
		segment.kind === 'auto-bezier' ? segment.interiorAnchors.map((anchor) => anchor.id) : []
	);
	const nextSegment = insertInteriorAnchorOnSegment(segment, point);
	const inserted = nextSegment.interiorAnchors.find((anchor) => !existingIds.has(anchor.id));
	if (!inserted) return failInteriorAnchorMutation(state, 'Could not insert wall anchor');
	const nextRoom: LayoutRoom = {
		...room,
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((candidate) => (candidate.id === segmentId ? nextSegment : candidate))
		}
	};
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failInteriorAnchorMutation(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	const applied = applyLayoutMutation(state, layout);
	if (!applied.success) return failInteriorAnchorMutation(state, applied.message);
	return { success: true, anchorId: inserted.id };
}

export function updateLayoutWallInteriorAnchor(
	state: LayoutPreviewState,
	roomId: string,
	segmentId: string,
	anchorId: string,
	point: LayoutVec2
): LayoutRoomEditResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	const segment = room?.boundary.segments.find((candidate) => candidate.id === segmentId);
	if (!floor || !room || !segment || segment.kind !== 'auto-bezier') {
		return failRoomEdit(state, 'Curved wall no longer exists');
	}
	if (!segment.interiorAnchors.some((anchor) => anchor.id === anchorId)) {
		return failRoomEdit(state, 'Interior anchor no longer exists');
	}
	const nextSegment = updateInteriorAnchorOnSegment(segment, anchorId, point);
	const nextRoom: LayoutRoom = {
		...room,
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((candidate) => (candidate.id === segmentId ? nextSegment : candidate))
		}
	};
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failRoomEdit(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	const applied = applyLayoutMutation(state, layout);
	if (!applied.success) return failRoomEdit(state, applied.message);
	return { success: true };
}

export function deleteLayoutWallInteriorAnchor(
	state: LayoutPreviewState,
	roomId: string,
	segmentId: string,
	anchorId: string
): LayoutRoomEditResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	const segment = room?.boundary.segments.find((candidate) => candidate.id === segmentId);
	if (!floor || !room || !segment || segment.kind !== 'auto-bezier') {
		return failRoomEdit(state, 'Curved wall no longer exists');
	}
	if (!segment.interiorAnchors.some((anchor) => anchor.id === anchorId)) {
		return failRoomEdit(state, 'Interior anchor no longer exists');
	}
	const nextSegment = deleteInteriorAnchorOnSegment(segment, anchorId);
	const nextRoom: LayoutRoom = {
		...room,
		boundary: {
			...room.boundary,
			segments: room.boundary.segments.map((candidate) => (candidate.id === segmentId ? nextSegment : candidate))
		}
	};
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failRoomEdit(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	const applied = applyLayoutMutation(state, layout);
	if (!applied.success) return failRoomEdit(state, applied.message);
	return { success: true };
}

export function commitLayoutPathRoom(
	state: LayoutPreviewState,
	segments: readonly DraftSegment[]
): LayoutDraftCommitResult {
	if (segments.length < 3) return { success: false, message: 'A room needs at least three segments' };
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors[0] ?? { id: 'floor-ground', name: 'Ground Floor', elevation: 0, height: 3, rooms: [] };
	if (!layout.floors[0]) layout.floors = [floor];
	const roomId = nextRoomId(floor.rooms);
	const boundary = { closed: true as const, segments: segments.map((segment) => cloneJson(segment)) };
	const room: LayoutRoom = {
		id: roomId,
		name: `Draft Room ${floor.rooms.length + 1}`,
		frame: deriveLayoutRoomFrame({ boundary }),
		boundary,
		wallThickness: 0.16,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		openings: []
	};
	const geometryIssues = validateLineRoom(room, floor);
	if (hasBlockingLayoutIssues(geometryIssues)) return { success: false, message: geometryIssues[0]!.message };
	floor.rooms = [...floor.rooms, room];
	try {
		const bundle = derivePreviewBundle(state.project.id, 'Draft Layout Preview', layout, state.project.scene);
		state.source = 'draft';
		commitPreviewBundle(state, bundle);
		state.previewVersion += 1;
		state.lastMutationMessage = null;
		state.statusMessage = null;
		state.importError = null;
		return { success: true, roomId };
	} catch (error) {
		return { success: false, message: error instanceof Error ? error.message : 'Could not commit room draft' };
	}
}

export function previewLayoutRoomUnit(
	state: LayoutPreviewState,
	roomId: string,
	transform: LayoutRoomUnitTransform
): LayoutRoomEditResult {
	const result = transformLayoutRoomUnit(state.project.layout, roomId, transform);
	if (!result.success) return failRoomEdit(state, result.message);
	const applied = applyLayoutMutation(state, result.document);
	return applied.success ? { success: true } : failRoomEdit(state, applied.message);
}

export function commitLayoutRoomEdit(
	state: LayoutPreviewState,
	roomId: string,
	points: readonly LayoutVec2[]
): LayoutRoomEditResult {
	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors.find((candidate) => candidate.rooms.some((room) => room.id === roomId));
	const room = floor?.rooms.find((candidate) => candidate.id === roomId);
	if (!floor || !room) return failRoomEdit(state, 'Room no longer exists');
	if (points.length !== room.boundary.segments.length || points.some((point) => point.some((value) => !Number.isFinite(value)))) {
		return failRoomEdit(state, 'Room edit contains invalid coordinates');
	}
	const nextRoom = replaceRoomPoints(room, points);
	const issues = validateLineRoom(nextRoom, floor);
	if (hasBlockingLayoutIssues(issues)) return failRoomEdit(state, issues[0]!.message);
	floor.rooms = floor.rooms.map((candidate) => (candidate.id === roomId ? nextRoom : candidate));
	try {
		applyLayoutMutation(state, layout);
		return { success: true };
	} catch (error) {
		return failRoomEdit(state, error instanceof Error ? error.message : 'Could not edit room');
	}
}

export function commitLayoutDraftRoom(
	state: LayoutPreviewState,
	points: readonly LayoutVec2[]
): LayoutDraftCommitResult {
	if (points.length < 3) {
		return { success: false, message: 'A room needs at least three points' };
	}
	if (points.some((point) => point.some((value) => !Number.isFinite(value)))) {
		return { success: false, message: 'Room points must be finite coordinates' };
	}

	const layout = cloneLayout(state.project.layout);
	const floor = layout.floors[0] ?? {
		id: 'floor-ground',
		name: 'Ground Floor',
		elevation: 0,
		height: 3,
		rooms: []
	};
	if (!layout.floors[0]) layout.floors = [floor];

	const roomId = nextRoomId(floor.rooms);
	const room: LayoutRoom = {
		id: roomId,
		name: `Draft Room ${floor.rooms.length + 1}`,
		frame: deriveLayoutRoomFrame({
			boundary: {
				closed: true,
				segments: points.map((start, index) => ({
					id: `${roomId}:wall:${index}`,
					kind: 'line' as const,
					start: [...start] as LayoutVec2,
					end: [...points[(index + 1) % points.length]!] as LayoutVec2
				}))
			}
		}),
		boundary: {
			closed: true,
			segments: points.map((start, index) => ({
				id: `${roomId}:wall:${index}`,
				kind: 'line' as const,
				start: [...start] as LayoutVec2,
				end: [...points[(index + 1) % points.length]!] as LayoutVec2
			}))
		},
		wallThickness: 0.16,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		openings: []
	};
	const geometryIssues = validateLineRoom(room, floor);
	if (hasBlockingLayoutIssues(geometryIssues)) {
		state.lastMutationMessage = `Room draft rejected: ${geometryIssues[0]!.message}`;
		return {
			success: false,
			message: `Room draft rejected: ${geometryIssues[0]!.message}`
		};
	}
	floor.rooms = [...floor.rooms, room];

	try {
		const bundle = derivePreviewBundle(state.project.id, 'Draft Layout Preview', layout, state.project.scene);
		state.source = 'draft';
		commitPreviewBundle(state, bundle);
		state.previewVersion += 1;
		state.lastMutationMessage = null;
		state.statusMessage = null;
		state.importError = null;
		return { success: true, roomId };
	} catch (error) {
		state.lastMutationMessage = error instanceof Error ? error.message : 'Could not commit room draft';
		return {
			success: false,
			message: state.lastMutationMessage
		};
	}
}

/** Editor layout sessions may temporarily diverge from scene room references. */
function createPreviewProject(input: {
	id: string;
	name: string;
	layout: unknown;
	scene: MuseumProject['scene'];
}): MuseumProject {
	const validation = validateLayoutDocument(input.layout);
	if (!validation.success) {
		const first = validation.issues[0]!;
		throw new Error(`${first.path} (${first.code}): ${first.message}`);
	}
	return {
		id: input.id,
		name: input.name,
		layout: validation.document,
		scene: input.scene
	};
}

function createState(
	source: LayoutPreviewSource,
	layout: ReturnType<typeof createEmptyLayoutDocument>,
	scene: MuseumProject['scene'],
	previousVersion: number
): LayoutPreviewState {
	const bundle = derivePreviewBundle(
		'project:layout-preview',
		source === 'chopin-fixture' ? 'Chopin Layout Preview' : 'Empty Layout Preview',
		layout,
		scene
	);
	const baselineLayoutJson = serializeLayoutDocument(bundle.project.layout);
	const baselineKind: LayoutBaselineKind = source === 'empty' ? 'blank' : 'imported';
	return {
		source,
		project: bundle.project,
		model: bundle.model,
		geometry: bundle.geometry,
		wallMeshesByRoom: bundle.wallMeshesByRoom,
		layout3dPickIndexByRoom: bundle.layout3dPickIndexByRoom,
		issues: bundle.issues,
		bounds: bundle.bounds,
		previewVersion: previousVersion + 1,
		reframeVersion: 0,
		showCeilings: false,
		lastMutationMessage: null,
		statusMessage: null,
		importError: null,
		baselineLayoutJson,
		baselineKind
	};
}

function cloneLayout(layout: MuseumProject['layout']): MuseumProject['layout'] {
	return cloneJson(layout);
}

/** Deep-clone plain data; safe for Svelte `$state` proxies (unlike `structuredClone`). */
function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function nextRoomId(rooms: readonly LayoutRoom[]): string {
	const ids = new Set(rooms.map((room) => room.id));
	let index = rooms.length + 1;
	while (ids.has(`layout-room-${index}`)) index += 1;
	return `layout-room-${index}`;
}

function applyLayoutMutation(
	state: LayoutPreviewState,
	layout: MuseumProject['layout'],
	openingId?: string
): LayoutOpeningMutationResult {
	try {
		const structural = validateLayoutDocument(layout);
		if (!structural.success) return failOpeningMutation(state, structural.issues[0]!.message);
		const geometryIssues = validateLayoutDocumentGeometry(structural.document);
		if (hasBlockingLayoutIssues(geometryIssues)) {
			return failOpeningMutation(state, geometryIssues[0]!.message);
		}
		const bundle = derivePreviewBundle(state.project.id, 'Draft Layout Preview', structural.document, state.project.scene);
		state.source = 'draft';
		commitPreviewBundle(state, bundle);
		state.previewVersion += 1;
		state.lastMutationMessage = null;
		state.statusMessage = null;
		state.importError = null;
		return { success: true, openingId: openingId ?? '' };
	} catch (error) {
		return failOpeningMutation(state, error instanceof Error ? error.message : 'Could not update layout');
	}
}

function failOpeningMutation(
	state: LayoutPreviewState,
	message: string
): LayoutOpeningMutationResult {
	state.lastMutationMessage = message;
	return { success: false, message };
}

function failRoomEdit(state: LayoutPreviewState, message: string): LayoutRoomEditResult {
	state.lastMutationMessage = message;
	return { success: false, message };
}

function failInteriorAnchorMutation(
	state: LayoutPreviewState,
	message: string
): LayoutInteriorAnchorMutationResult {
	state.lastMutationMessage = message;
	return { success: false, message };
}

function failObjectMutation(state: LayoutPreviewState, message: string): LayoutObjectMutationResult {
	state.lastMutationMessage = message;
	state.statusMessage = message;
	return { success: false, message };
}

function replaceState(target: LayoutPreviewState, next: LayoutPreviewState): void {
	target.source = next.source;
	target.project = next.project;
	target.model = next.model;
	target.geometry = next.geometry;
	target.wallMeshesByRoom = next.wallMeshesByRoom;
	target.layout3dPickIndexByRoom = next.layout3dPickIndexByRoom;
	target.issues = next.issues;
	target.bounds = next.bounds;
	target.previewVersion = next.previewVersion;
	target.reframeVersion += 1;
	// Keep layout-local ceiling inspection preference across reload/reset.
	target.lastMutationMessage = null;
	target.statusMessage = null;
	target.importError = null;
	target.baselineLayoutJson = next.baselineLayoutJson;
	target.baselineKind = next.baselineKind;
}

export type LayoutPreviewSnapshot = {
	source: LayoutPreviewState['source'];
	project: LayoutPreviewState['project'];
	model: LayoutPreviewState['model'];
	geometry: LayoutPreviewState['geometry'];
	issues: LayoutPreviewState['issues'];
	bounds: LayoutPreviewState['bounds'];
	lastMutationMessage: string | null;
	statusMessage: string | null;
	importError: string | null;
};

export function captureLayoutPreviewSnapshot(state: LayoutPreviewState): LayoutPreviewSnapshot {
	return {
		source: state.source,
		project: cloneJson(state.project),
		model: cloneJson(state.model),
		geometry: state.geometry,
		issues: cloneJson(state.issues),
		lastMutationMessage: state.lastMutationMessage,
		statusMessage: state.statusMessage,
		importError: state.importError,
		bounds: state.bounds
			? {
					min: [state.bounds.min[0], state.bounds.min[1], state.bounds.min[2]],
					max: [state.bounds.max[0], state.bounds.max[1], state.bounds.max[2]]
				}
			: null
	};
}

export function restoreLayoutPreviewSnapshot(state: LayoutPreviewState, snapshot: LayoutPreviewSnapshot): void {
	state.source = snapshot.source;
	state.project = cloneJson(snapshot.project);
	state.model = cloneJson(snapshot.model);
	state.geometry = snapshot.geometry;
	// The snapshot's `issues` already includes mesh issues from capture time,
	// and undo restores the same geometry, so re-deriving would duplicate them.
	state.issues = cloneJson(snapshot.issues);
	// The wall-mesh + pick-index caches are derived and never part of the undo
	// snapshot: undo restores the document and the caches rebuild from geometry.
	const meshes = buildWallMeshesByRoom(snapshot.geometry);
	state.wallMeshesByRoom = meshes.wallMeshesByRoom;
	state.layout3dPickIndexByRoom = meshes.layout3dPickIndexByRoom;
	state.bounds = snapshot.bounds
		? {
				min: [snapshot.bounds.min[0], snapshot.bounds.min[1], snapshot.bounds.min[2]],
				max: [snapshot.bounds.max[0], snapshot.bounds.max[1], snapshot.bounds.max[2]]
			}
		: null;
	state.previewVersion += 1;
	state.lastMutationMessage = snapshot.lastMutationMessage;
	state.statusMessage = snapshot.statusMessage;
	state.importError = snapshot.importError;
}
