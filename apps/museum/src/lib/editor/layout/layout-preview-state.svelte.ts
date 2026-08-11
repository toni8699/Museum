import { museumSceneDocument } from '$lib/content/scene';
import { createMuseumProject } from '$lib/editor/project/project-codec';
import type { MuseumProject } from '$lib/editor/project/project-types';
import { createEmptyLayoutDocument } from './layout-codec';
import { buildLayoutPreviewModel, type LayoutPreviewModel } from './layout-mesh-factory';
import { layoutPreviewBounds, type LayoutPreviewBounds } from './layout-preview-bounds';
import type { LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';
import { replaceRoomPoints } from './layout-editing';
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
import { roomsToLayout } from './rooms-to-layout';
import { validateLineRoom, type LayoutGeometryIssue } from './layout-validation';

export type LayoutPreviewSource = 'chopin-fixture' | 'empty' | 'draft';

export type LayoutPreviewState = {
	source: LayoutPreviewSource;
	project: MuseumProject;
	model: LayoutPreviewModel;
	issues: LayoutGeometryIssue[];
	bounds: LayoutPreviewBounds | null;
	previewVersion: number;
	showCeilings: boolean;
	lastMutationMessage: string | null;
};

export type LayoutDraftCommitResult =
	| { success: true; roomId: string }
	| { success: false; message: string };

export type LayoutRoomEditResult =
	| { success: true }
	| { success: false; message: string };

export type LayoutOpeningMutationResult =
	| { success: true; openingId: string }
	| { success: false; message: string };

export function createLayoutPreviewState(): LayoutPreviewState {
	return createState('chopin-fixture', roomsToLayout(), museumSceneDocument, 0);
}

export function layoutPreviewSourceLabel(source: LayoutPreviewSource): string {
	switch (source) {
		case 'chopin-fixture':
			return 'Chopin fixture';
		case 'empty':
			return 'Empty layout';
		case 'draft':
			return 'Draft layout';
	}
}

export function loadChopinLayoutPreview(state: LayoutPreviewState): boolean {
	replaceState(
		state,
		createState('chopin-fixture', roomsToLayout(), state.project.scene, state.previewVersion)
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
	const result = buildLayoutPreviewModel(state.project.layout);
	state.model = result.model;
	state.issues = result.issues;
	state.bounds = layoutPreviewBounds(result.model);
	state.previewVersion += 1;
	state.lastMutationMessage = null;
	return true;
}

export function toggleLayoutCeilings(state: LayoutPreviewState): void {
	state.showCeilings = !state.showCeilings;
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
	if (!floor || !room || !segment || segment.kind !== 'line') {
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
	if (issues.length > 0) return failOpeningMutation(state, issues[0]!.message);
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
	if (issues.length > 0) return failOpeningMutation(state, issues[0]!.message);
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
	if (issues.length > 0) return failRoomEdit(state, issues[0]!.message);
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
	if (geometryIssues.length > 0) {
		state.lastMutationMessage = `Room draft rejected: ${geometryIssues[0]!.message}`;
		return {
			success: false,
			message: `Room draft rejected: ${geometryIssues[0]!.message}`
		};
	}
	floor.rooms = [...floor.rooms, room];

	try {
		const nextProject = createMuseumProject({
			id: state.project.id,
			name: 'Draft Layout Preview',
			layout,
			scene: state.project.scene
		});
		const result = buildLayoutPreviewModel(nextProject.layout);
		state.source = 'draft';
		state.project = nextProject;
		state.model = result.model;
		state.issues = result.issues;
		state.bounds = layoutPreviewBounds(result.model);
		state.previewVersion += 1;
		return { success: true, roomId };
	} catch (error) {
		state.lastMutationMessage = error instanceof Error ? error.message : 'Could not commit room draft';
		return {
			success: false,
			message: state.lastMutationMessage
		};
	}
}

function createState(
	source: LayoutPreviewSource,
	layout: ReturnType<typeof createEmptyLayoutDocument>,
	scene: MuseumProject['scene'],
	previousVersion: number
): LayoutPreviewState {
	const project = createMuseumProject({
		id: 'project:layout-preview',
		name: source === 'chopin-fixture' ? 'Chopin Layout Preview' : 'Empty Layout Preview',
		layout,
		scene
	});
	const result = buildLayoutPreviewModel(project.layout);
	return {
		source,
		project,
		model: result.model,
		issues: result.issues,
		bounds: layoutPreviewBounds(result.model),
		previewVersion: previousVersion + 1,
		showCeilings: false,
		lastMutationMessage: null
	};
}

function cloneLayout(layout: MuseumProject['layout']): MuseumProject['layout'] {
	return JSON.parse(JSON.stringify(layout)) as MuseumProject['layout'];
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
		const nextProject = createMuseumProject({
			id: state.project.id,
			name: 'Draft Layout Preview',
			layout,
			scene: state.project.scene
		});
		const result = buildLayoutPreviewModel(nextProject.layout);
		state.source = 'draft';
		state.project = nextProject;
		state.model = result.model;
		state.issues = result.issues;
		state.bounds = layoutPreviewBounds(result.model);
		state.previewVersion += 1;
		state.lastMutationMessage = null;
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

function replaceState(target: LayoutPreviewState, next: LayoutPreviewState): void {
	target.source = next.source;
	target.project = next.project;
	target.model = next.model;
	target.issues = next.issues;
	target.bounds = next.bounds;
	target.previewVersion = next.previewVersion;
	target.showCeilings = next.showCeilings;
	target.lastMutationMessage = null;
}
