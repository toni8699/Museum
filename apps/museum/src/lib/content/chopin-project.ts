import rawChopinProject from './chopin-project.json';
import {
	createNavigationGraph,
	resolveSceneDocument,
	type NavigationGraph,
	type RuntimeScene
} from './scene';
import { validateProject } from '$lib/project/project-codec';
import {
	createLayoutRoomRegistry,
	type LayoutRoomRegistry
} from '$lib/project/project-layout-semantics';
import type { Project } from '$lib/project/project-types';
import {
	chopinRoomPresentation,
	validateChopinRoomPresentation,
	type ChopinRoomPresentation
} from './chopin-room-presentation';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { hasBlockingLayoutIssues } from '$lib/layout/layout-geometry-validation';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';

export type Runtime = {
	project: Project;
	rooms: LayoutRoomRegistry;
	scene: RuntimeScene;
	graph: NavigationGraph;
	presentation: Readonly<Record<string, ChopinRoomPresentation>>;
	geometry: CompiledLayoutGeometry;
};

const validation = validateProject(rawChopinProject);
if (!validation.success) {
	const first = validation.issues[0]!;
	throw new Error(`Invalid Chopin project: ${first.path} (${first.code}) — ${first.message}`);
}

export const chopinProject = validation.project;
validateChopinRoomPresentation(chopinProject);

const rooms = createLayoutRoomRegistry(chopinProject.layout);
const resolvedScene = resolveSceneDocument(chopinProject.scene, rooms);
const graph = createNavigationGraph(resolvedScene);

const geometryResult = compileLayoutGeometry(chopinProject.layout);
if (hasBlockingLayoutIssues(geometryResult.issues)) {
	const first = geometryResult.issues[0]!;
	throw new Error(`Invalid Chopin layout geometry: ${first.path} (${first.code}) — ${first.message}`);
}

export const chopinRuntime: Runtime = {
	project: chopinProject,
	rooms,
	scene: resolvedScene,
	graph,
	presentation: chopinRoomPresentation,
	geometry: geometryResult.geometry
};

/** Compatibility aliases. All derive from the same validated project instance. */
export const sceneDocument = chopinProject.scene;
export const scene = chopinRuntime.scene;
export const navigationGraph = chopinRuntime.graph;
export const nodeById = chopinRuntime.graph.nodeById;
