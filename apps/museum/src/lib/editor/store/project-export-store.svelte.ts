/**
 * `editor/store/project-export-store.svelte.ts` — Phase 5.4 plain-JSON export
 * gate.
 *
 * **Predicate — single source of truth for the export gate.** A
 * `SceneTextureAsset.uri` is *resolved* by walking the cases in order:
 *
 *  1. **`binaryStore.has(uri)`** → resolved (served by an in-session binary).
 *  2. **`isPackageRewriteUri(uri)`** → BLOCKED. Package-bound rewrite URIs
 *     (the `/textures/package-<12-hex>/...` format emitted by
 *     `REWRITE_URI_PREFIX` in `content/package-format.ts`) have no static
 *     backing on disk; they only carry meaning when the matching binary is
 *     registered. Even though they pass the project's `isSafeTextureUri`
 *     predicate, fetching them in the editor would 404.
 *  3. **`isSafeTextureUri(uri)`** → resolved (to be dispatched by
 *     `texture-cache.ts`'s public-fetch path — that wire is Task 6).
 *
 * Any URI that survives steps 1–3 unresolved is collected into the
 * `ProjectExportBlocker` returned to the project menu / status bar.
 *
 * **Pure functions.** `computeProjectExportBlocker(document, binaryStore)`
 * is callable from inside Svelte 5 `$derived` blocks because the only
 * reactive read is `binaryStore.has(uri)` (a method on the
 * `$state`-wrapped `BinaryTextureStore` Map) — see
 * `binary-texture-store.svelte.ts` for the reactivity contract.
 *
 * **No facade / no instance helpers required for this slice.** Task 8
 * (Project menu) will wire the consumer; this file's only contract is the
 * predicate + the blocker shape.
 */

import type { SceneDocument, SceneTextureAsset } from '$lib/content/scene';
import { isSafeTextureUri } from '$lib/content/texture-uri';

/** Structural blocker surfaced to the project menu / status bar. */
export type ProjectExportBlocker = {
	unresolvedTextures: SceneTextureAsset[];
};

/** Minimal contract a binary store must satisfy for the predicate to read it. */
export type BinaryLike = {
	has(uri: string): boolean;
};

/** `package-<12 hex>` per content/package-format.ts `REWRITE_URI_PREFIX`. */
const PACKAGE_REWRITE_REGEX = /^\/textures\/package-[0-9a-f]{12}\/[^?#]+$/;

/**
 * Session-local binary URIs minted by `TextureLibraryController.registerLocalFileTexture`
 * (`/local/<12 hex>/<stem>.<ext>` per `createLocalRandomId`). These also have no
 * static backing and must be treated as package-bound.
 */
const LOCAL_BINARY_REGEX = /^\/local\/[0-9a-f]{12}\/[^?#]+$/;

/** True when `uri` lives under a binary-explicit prefix with no static backing. */
export function isPackageRewriteUri(uri: string): boolean {
	return PACKAGE_REWRITE_REGEX.test(uri) || LOCAL_BINARY_REGEX.test(uri);
}

/**
 * True iff a single URI is satisfiable via the rule above. Branch order is
 * the predicate's contract — see the file docstring.
 */
export function isTextureUriResolved(uri: string, hasFn: (uri: string) => boolean): boolean {
	if (hasFn(uri)) return true;
	if (isPackageRewriteUri(uri)) return false;
	return isSafeTextureUri(uri);
}

/**
 * Walk every texture in `document.textures` and collect the unresolved ones.
 * Returns `null` if every texture is resolved.
 */
export function computeProjectExportBlocker(
	document: SceneDocument,
	binaryStore: BinaryLike
): ProjectExportBlocker | null {
	const unresolved: SceneTextureAsset[] = [];
	// Bind explicitly: `binaryStore.has` is a real method reference; calling
	// it without a receiver makes `this` undefined and crashes class field
	// reads like `this.#map`. The bind is one-shot per predicate call.
	const has = binaryStore.has.bind(binaryStore);
	for (const t of document.textures) {
		if (!isTextureUriResolved(t.uri, has)) {
			unresolved.push(t);
		}
	}
	return unresolved.length > 0 ? { unresolvedTextures: unresolved } : null;
}

/**
 * Cheap count helper. Equivalent to
 * `computeProjectExportBlocker(doc, store)?.unresolvedTextures.length ?? 0`.
 */
export function unresolvedCount(document: SceneDocument, binaryStore: BinaryLike): number {
	return computeProjectExportBlocker(document, binaryStore)?.unresolvedTextures.length ?? 0;
}

/**
 * ID list helper. Equivalent to
 * `computeProjectExportBlocker(doc, store)?.unresolvedTextures.map(t => t.id) ?? []`.
 */
export function unresolvedIds(document: SceneDocument, binaryStore: BinaryLike): string[] {
	const blocker = computeProjectExportBlocker(document, binaryStore);
	if (!blocker) return [];
	return blocker.unresolvedTextures.map((t) => t.id);
}
