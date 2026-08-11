import { museumSceneDocument } from '$lib/content/scene';
import { createMuseumProject } from '$lib/editor/project/project-codec';
import type { MuseumProject } from '$lib/editor/project/project-types';
import { createEmptyLayoutDocument } from './layout-codec';
import { buildLayoutPreviewModel, type LayoutPreviewModel } from './layout-mesh-factory';
import { layoutPreviewBounds, type LayoutPreviewBounds } from './layout-preview-bounds';
import type { LayoutRoom, LayoutVec2 } from './layout-types';
import { roomsToLayout } from './rooms-to-layout';
import type { LayoutGeometryIssue } from './layout-validation';

export type LayoutPreviewSource = 'chopin-fixture' | 'empty' | 'draft';

export type LayoutPreviewState = {
	source: LayoutPreviewSource;
	project: MuseumProject;
	model: LayoutPreviewModel;
	issues: LayoutGeometryIssue[];
	bounds: LayoutPreviewBounds | null;
	previewVersion: number;
};

export type LayoutDraftCommitResult =
	| { success: true; roomId: string }
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
	return true;
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
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Could not commit room draft'
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
		previewVersion: previousVersion + 1
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

function replaceState(target: LayoutPreviewState, next: LayoutPreviewState): void {
	target.source = next.source;
	target.project = next.project;
	target.model = next.model;
	target.issues = next.issues;
	target.bounds = next.bounds;
	target.previewVersion = next.previewVersion;
}
