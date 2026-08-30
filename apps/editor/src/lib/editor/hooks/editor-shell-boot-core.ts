/**
 * P7.4 — shared editor-shell boot core (pure, node-testable).
 *
 * The three pure helpers extract the boot glue that was duplicated verbatim
 * between `MuseumEditorApp.svelte` (relic, `/museum/editor`) and
 * `app/EditorApp.svelte` (`/`, `/editor`): the dirty-guard label logic, the
 * `beforeunload` guard, and the texture-loader install/teardown. The thin
 * Svelte glue that wires them to `onMount` / `$effect` / `beforeNavigate`
 * lives in `./editor-shell-boot.svelte.ts` and owns no logic of its own.
 *
 * Everything here is importable under the node test harness: no `$app/*`
 * imports, no `svelte` imports, no runes.
 */

import { TextureLoader, type Texture } from 'three';
import type { MaterialTextureSlot } from '$lib/types/materials';
import {
	setDefaultTextureSourceLoader,
	type TextureSourceLoader
} from '$lib/museum/materials/texture-cache';
import { BinaryTextureStore } from '$lib/editor/store/binary-texture-store.svelte';

export type NavigationConfirmLabel = 'scene' | 'layout' | 'scene and layout';

export type ConfirmNavigationResult =
	| { needsConfirmation: false; label: null }
	| { needsConfirmation: true; label: NavigationConfirmLabel };

/**
 * The shared `confirmNavigation` decision, minus the `window.confirm` side
 * effect (which cannot run under the node harness). The two shells' label
 * logic is preserved byte-for-byte.
 */
export function computeConfirmNavigation(input: {
	sceneDirty: boolean;
	layoutDirty: boolean;
}): ConfirmNavigationResult {
	const { sceneDirty, layoutDirty } = input;
	if (!sceneDirty && !layoutDirty) return { needsConfirmation: false, label: null };
	const label: NavigationConfirmLabel =
		sceneDirty && layoutDirty ? 'scene and layout' : sceneDirty ? 'scene' : 'layout';
	return { needsConfirmation: true, label };
}

export type EventTargetLike = {
	addEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
	removeEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
};

export type UnloadGuard = {
	attach(): void;
	detach(): void;
};

/**
 * The dirty-gated `beforeunload` guard. `attach` registers the prevent-unload
 * listener exactly once; `detach` removes it. Both are idempotent, so callers
 * can attach/detach defensively without tracking their own flag — the Svelte
 * glue creates the guard lazily inside its `$effect` and lets effect teardown
 * remove the listener on the dirty→clean flip and on unmount.
 */
export function createUnloadGuard(target: EventTargetLike): UnloadGuard {
	const onBeforeUnload = (event: BeforeUnloadEvent) => {
		event.preventDefault();
		event.returnValue = '';
	};
	let attached = false;
	return {
		attach() {
			if (attached) return;
			target.addEventListener('beforeunload', onBeforeUnload);
			attached = true;
		},
		detach() {
			if (!attached) return;
			target.removeEventListener('beforeunload', onBeforeUnload);
			attached = false;
		}
	};
}

export type BinaryTextureStoreLike = {
	objectUrlFor(uri: string): string | null;
	clearExcept(retainUris: ReadonlySet<string>): void;
};

export type TextureLifecycle = {
	install(): void;
	teardown(): void;
};

/**
 * Texture-loader install/teardown. Install injects the editor source loader
 * (binary store first, legacy public fetch second); teardown restores the
 * legacy path and sweeps the binary store's object-URL registry — the HMR
 * stale-URL guard the shells previously owned inline.
 */
export function createTextureLifecycle(
	loader: TextureSourceLoader,
	binaryStore: BinaryTextureStoreLike = BinaryTextureStore
): TextureLifecycle {
	return {
		install() {
			setDefaultTextureSourceLoader(loader);
		},
		teardown() {
			setDefaultTextureSourceLoader(null);
			binaryStore.clearExcept(new Set());
		}
	};
}

/**
 * The editor's default source loader: consult the binary store's object URL
 * first, then fall back to the legacy public-fetch path. Extracted verbatim
 * from both shells.
 */
export function createEditorSourceLoader(
	binaryStore: BinaryTextureStoreLike = BinaryTextureStore
): TextureSourceLoader {
	const loader = new TextureLoader();
	return (uri: string, _slot: MaterialTextureSlot): Promise<Texture> => {
		const url = binaryStore.objectUrlFor(uri);
		if (url) return loader.loadAsync(url);
		return new Promise<Texture>((resolve, reject) => {
			loader.load(uri, resolve, undefined, reject);
		});
	};
}
