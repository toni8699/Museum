import rawChopinProject from './chopin-project.json';
import {
	createNavigationGraph,
	resolveSceneDocument,
	type NavigationGraph,
	type RuntimeMuseumScene
} from './scene';
import { validateMuseumProject } from '$lib/project/project-codec';
import {
	createLayoutRoomRegistry,
	type LayoutRoomRegistry
} from '$lib/project/project-layout-semantics';
import type { MuseumProject } from '$lib/project/project-types';
import {
	chopinRoomPresentation,
	validateChopinRoomPresentation,
	type ChopinRoomPresentation
} from './chopin-room-presentation';

export type MuseumRuntime = {
	project: MuseumProject;
	rooms: LayoutRoomRegistry;
	scene: RuntimeMuseumScene;
	graph: NavigationGraph;
	presentation: Readonly<Record<string, ChopinRoomPresentation>>;
};

const validation = validateMuseumProject(rawChopinProject);
if (!validation.success) {
	const first = validation.issues[0]!;
	throw new Error(`Invalid Chopin project: ${first.path} (${first.code}) — ${first.message}`);
}

export const chopinProject = validation.project;
validateChopinRoomPresentation(chopinProject);

const rooms = createLayoutRoomRegistry(chopinProject.layout);
const scene = resolveSceneDocument(chopinProject.scene, rooms);
const graph = createNavigationGraph(scene);

export const chopinRuntime: MuseumRuntime = {
	project: chopinProject,
	rooms,
	scene,
	graph,
	presentation: chopinRoomPresentation
};

/** Compatibility aliases. All derive from the same validated project instance. */
export const museumSceneDocument = chopinProject.scene;
export const museumScene = chopinRuntime.scene;
export const museumNavigationGraph = chopinRuntime.graph;
export const nodeById = chopinRuntime.graph.nodeById;
