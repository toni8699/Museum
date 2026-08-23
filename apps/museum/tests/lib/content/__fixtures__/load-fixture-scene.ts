import {
	createNavigationGraph,
	resolveSceneDocument,
	type SceneDocument,
	type NavigationGraph,
	type RuntimeScene
} from '$lib/content/scene';
import { chopinRuntime } from '$lib/content/chopin-project';
import { validateSceneDocument } from '$lib/content/scene-codec';
import tourMinimalRaw from './tour-minimal.json';

export type FixtureSceneName = 'tour-minimal';

export type LoadedFixtureScene = {
	document: SceneDocument;
	scene: RuntimeScene;
	graph: NavigationGraph;
};

const fixtures: Record<FixtureSceneName, unknown> = {
	'tour-minimal': tourMinimalRaw
};

/**
 * Load a checked-in test fixture through the same validate → resolve → graph
 * pipeline as production. Tests that need stable topology/goldens must use
 * this instead of the live `scene.json` singleton.
 */
export function loadFixtureScene(name: FixtureSceneName = 'tour-minimal'): LoadedFixtureScene {
	const validation = validateSceneDocument(fixtures[name]);
	if (!validation.success) {
		const first = validation.issues[0];
		throw new Error(
			`Fixture "${name}" failed validation: ${first?.code ?? 'unknown'} ${first?.path ?? ''} ${first?.message ?? ''}`
		);
	}
	const document = validation.document;
	const scene = resolveSceneDocument(document, chopinRuntime.rooms);
	const graph = createNavigationGraph(scene);
	return { document, scene, graph };
}

/** Deep-clone a fixture document for mutation-friendly tests. */
export function cloneFixtureDocument(name: FixtureSceneName = 'tour-minimal'): SceneDocument {
	return JSON.parse(JSON.stringify(loadFixtureScene(name).document)) as SceneDocument;
}
