/**
 * P7.4 — shared editor-shell boot composable.
 *
 * Thin Svelte glue around `./editor-shell-boot-core`. Owns the dirty-guard
 * (`beforeNavigate` + `beforeunload`) and texture-loader lifecycle for both
 * shells. Shortcut wiring is deliberately NOT extracted: the relic registers
 * a 3-arg `registerEditorShortcuts` while the editor passes deselect +
 * stale-layout + gizmo-capability callbacks — a single signature cannot cover
 * both without leaking the new shell's gating model into the relic.
 */

import { beforeNavigate } from '$app/navigation';
import { onMount } from 'svelte';
import {
	computeConfirmNavigation,
	createEditorSourceLoader,
	createTextureLifecycle,
	createUnloadGuard
} from './editor-shell-boot-core';
import {
	layoutPreviewIsDirty,
	type LayoutPreviewState
} from '../layout/layout-preview-state.svelte';
import type { EditorStore } from '../editor-store.svelte';

export type EditorShellBootResult = {
	confirmSceneReplacement: () => boolean;
	confirmLayoutReplacement: () => boolean;
	confirmNavigation: () => boolean;
};

export function useEditorShellBoot(input: {
	store: EditorStore;
	layoutPreview: LayoutPreviewState;
	projectNameDirty?: () => boolean;
	/**
	 * P21.4 — retained-session navigation predicate. When true for the
	 * destination, the dirty guard is exempt (same-project Spatial↔Preview
	 * round trip preserves unsaved work). Defaults to false (relic).
	 */
	isRetainedSessionNavigation?: (url: URL) => boolean;
}): EditorShellBootResult {
	const {
		store,
		layoutPreview,
		projectNameDirty = () => false,
		isRetainedSessionNavigation
	} = input;
	const projectDirty = () =>
		store.isDirty || layoutPreviewIsDirty(layoutPreview) || projectNameDirty();

	const textureLifecycle = createTextureLifecycle(createEditorSourceLoader());
	onMount(() => {
		textureLifecycle.install();
		return () => textureLifecycle.teardown();
	});

	// The beforeunload guard is created lazily inside the effect — never at
	// component setup — so `window` is only referenced on the client, after
	// mount. SSR-safe by construction: `$effect` never runs during server
	// rendering, so a server render cannot touch `window`. The effect's
	// teardown removes the listener on a dirty→clean flip and on unmount.
	$effect(() => {
		if (!projectDirty()) return;
		const unloadGuard = createUnloadGuard(window);
		unloadGuard.attach();
		return () => unloadGuard.detach();
	});

	function confirmSceneReplacement(): boolean {
		return !store.isDirty || window.confirm('Discard unsaved scene changes?');
	}

	function confirmLayoutReplacement(): boolean {
		return !layoutPreviewIsDirty(layoutPreview) || window.confirm('Discard unsaved layout changes?');
	}

	function confirmNavigation(): boolean {
		if (projectNameDirty() && !store.isDirty && !layoutPreviewIsDirty(layoutPreview)) {
			return window.confirm('Discard unsaved project changes?');
		}
		const result = computeConfirmNavigation({
			sceneDirty: store.isDirty,
			layoutDirty: layoutPreviewIsDirty(layoutPreview)
		});
		if (!result.needsConfirmation) return true;
		return window.confirm(`Discard unsaved ${result.label} changes?`);
	}

	beforeNavigate((navigation) => {
		if (!projectDirty() || navigation.willUnload) return;
		if (isRetainedSessionNavigation?.(navigation.to?.url as URL)) return;
		if (!confirmNavigation()) navigation.cancel();
	});

	return { confirmSceneReplacement, confirmLayoutReplacement, confirmNavigation };
}
