/**
 * P21.4 — editor-side visitor preview coordinator.
 *
 * Computes entry blockers and composes detached preview bundles from the live
 * authoring session. Never touches cloud eligibility (`computeCloudSaveBlocker`
 * is irrelevant: retained local bytes render without Save/auth). Kept outside
 * the visitor import closure (imports editor stores + BinaryTextureStore).
 */
import { validateProject } from '$lib/project/project-codec';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import { derivePreviewBundle } from '$lib/editor/layout/layout-preview-state.svelte';
import { hasBlockingLayoutIssues } from '$lib/layout/layout-geometry-validation';
import {
	isPackageRewriteUri,
	isProjectAssetUri
} from '$lib/editor/store/project-export-store.svelte';
import { resolveSceneDocument, createNavigationGraph } from '$lib/content/scene';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { SceneDocument } from '$lib/content/scene';
import type { LayoutDocument } from '$lib/layout/layout-types';
import type { BinaryTextureEntry } from '$lib/editor/store/binary-texture-store.svelte';

export type PreviewTextureStoreLike = {
	has(uri: string): boolean;
	getEntry(uri: string): BinaryTextureEntry | null;
};

export type PreviewEntryConditions = {
	interactionActive: boolean;
	documentTransactionActive: boolean;
	projectMutationInFlight: boolean;
	projectAssetMutationInFlight: boolean;
	pendingPlacementActive: boolean;
	bootstrapBusy: boolean;
	pendingSaveHandoff: boolean;
};

export type PreviewBundleTextures = {
	bytesByUri: Map<string, { bytes: Uint8Array; mime: string }>;
	urlsByUri: Map<string, string>;
	resolveTexture: (uri: string) => string | null;
	dispose: () => void;
};

function requiresRetainedBytes(uri: string): boolean {
	if (isProjectAssetUri(uri)) return true;
	if (isPackageRewriteUri(uri)) return true;
	if (uri.startsWith('/local/')) return true;
	return false;
}

/**
 * Editor-side entry gate. Returns a human reason when preview must stay in
 * Spatial with the session untouched, or null when entry may proceed. Checks
 * busy/gesture conditions first, then project/geometry validation, then
 * retained-byte availability for local/package/project-asset textures.
 */
export function computeVisitorPreviewBlocker(input: {
	scene: SceneDocument;
	layout: LayoutDocument;
	projectId: string;
	projectName: string;
	conditions: PreviewEntryConditions;
	textureStore: PreviewTextureStoreLike;
}): string | null {
	const { scene, layout, projectId, projectName, conditions, textureStore } = input;
	if (conditions.projectMutationInFlight || conditions.bootstrapBusy) {
		return 'Project is loading — try Preview after it finishes';
	}
	if (conditions.projectAssetMutationInFlight) {
		return 'Finish the project asset upload before preview';
	}
	if (conditions.interactionActive || conditions.documentTransactionActive) {
		return 'Stop the current interaction before preview';
	}
	if (conditions.pendingPlacementActive) {
		return 'Finish or cancel placement before preview';
	}
	if (conditions.pendingSaveHandoff) {
		return 'Finish the pending save sign-in before preview';
	}
	const name = projectName.trim();
	if (!name) return 'Project name cannot be empty';
	if (!projectId) return 'Project is not ready for preview';

	const validation = validateProject({ id: projectId, name, layout, scene });
	if (!validation.success) {
		return validation.issues[0]?.message ?? 'Project validation failed';
	}
	let bundle;
	try {
		bundle = derivePreviewBundle(projectId, name, layout, scene);
	} catch (error) {
		return error instanceof Error ? error.message : 'Could not prepare preview';
	}
	if (hasBlockingLayoutIssues(bundle.issues)) {
		return bundle.issues[0]?.message ?? 'Layout geometry is invalid';
	}
	// Texture availability: retained bytes for local/package/project-asset,
	// loader-backed safe static otherwise. Unsupported blocks entry.
	for (const texture of scene.textures) {
		const uri = texture.uri;
		if (requiresRetainedBytes(uri)) {
			if (!textureStore.has(uri)) {
				return `Texture “${texture.name}” is not available for preview`;
			}
			const entry = textureStore.getEntry(uri);
			if (!entry || entry.bytes.byteLength === 0) {
				return `Texture “${texture.name}” is not available for preview`;
			}
			continue;
		}
		if (isSafeTextureUri(uri)) continue;
		return `Texture “${texture.name}” uses an unsupported source`;
	}
	return null;
}

export type DetachedPreviewBundle = {
	projectId: string;
	projectName: string;
	scene: ReturnType<typeof resolveSceneDocument>;
	geometry: ReturnType<typeof derivePreviewBundle>['geometry'];
	rooms: ReturnType<typeof createLayoutRoomRegistry>;
	graph: ReturnType<typeof createNavigationGraph>;
	textures: PreviewBundleTextures;
};

/**
 * Compose a detached, validated in-memory bundle for the visitor surface.
 * Uses the live Scene document (never the layout state's stale Scene copy),
 * validates without cloud checks/Save/baseline mutation/live installation.
 * Call `computeVisitorPreviewBlocker` first; this throws on invalid input.
 */
export function composeDetachedPreviewBundle(input: {
	scene: SceneDocument;
	layout: LayoutDocument;
	projectId: string;
	projectName: string;
	textureStore: PreviewTextureStoreLike;
}): DetachedPreviewBundle {
	const { scene, layout, projectId, projectName, textureStore } = input;
	const name = projectName.trim();
	const validation = validateProject({ id: projectId, name, layout, scene });
	if (!validation.success) {
		throw new Error(validation.issues[0]?.message ?? 'Project validation failed');
	}
	const preview = derivePreviewBundle(projectId, name, layout, scene);
	if (hasBlockingLayoutIssues(preview.issues)) {
		throw new Error(preview.issues[0]?.message ?? 'Layout geometry is invalid');
	}
	const rooms = createLayoutRoomRegistry(validation.project.layout);
	const runtimeScene = resolveSceneDocument(validation.project.scene, rooms);
	const graph = createNavigationGraph(runtimeScene);

	const bytesByUri = new Map<string, { bytes: Uint8Array; mime: string }>();
	const urlsByUri = new Map<string, string>();
	try {
		for (const texture of validation.project.scene.textures) {
			const uri = texture.uri;
			if (!requiresRetainedBytes(uri)) continue;
			const entry = textureStore.getEntry(uri);
			if (!entry || entry.bytes.byteLength === 0) {
				throw new Error(`Texture “${texture.name}” is not available for preview`);
			}
			const bytes = entry.bytes.slice();
			bytesByUri.set(uri, { bytes, mime: entry.mime });
			try {
				const blob = new Blob([bytes.slice()], { type: entry.mime });
				urlsByUri.set(uri, URL.createObjectURL(blob));
			} catch {
				throw new Error(`Texture “${texture.name}” is not available for preview`);
			}
		}
	} catch (error) {
		// The entry gate pre-verifies availability, so this is race-only; still,
		// never leak partially created snapshot URLs on the way out.
		for (const url of urlsByUri.values()) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// Best effort.
			}
		}
		urlsByUri.clear();
		throw error;
	}

	const resolveTexture = (uri: string): string | null => {
		const previewUrl = urlsByUri.get(uri);
		if (previewUrl) return previewUrl;
		if (requiresRetainedBytes(uri)) return null;
		return isSafeTextureUri(uri) ? uri : null;
	};

	const dispose = () => {
		for (const url of urlsByUri.values()) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// Already revoked.
			}
		}
		urlsByUri.clear();
	};

	return {
		projectId,
		projectName: name,
		scene: runtimeScene,
		geometry: preview.geometry,
		rooms,
		graph,
		textures: { bytesByUri, urlsByUri, resolveTexture, dispose }
	};
}
