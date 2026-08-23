/**
 * Slice 8 — editor keyboard shortcut cascade (app shell only).
 *
 * Escape order (audit §7 #4 / F16) must stay:
 * cameraPreview → stopCameraPreview (early return)
 * then (when not editing fields):
 * cancelPendingNavigation → cancelAssetPlacement → finishAnchorEditing →
 * finishViewKeyframeEditing → deselect (scene-owned only)
 */import { tick, getContext } from 'svelte';
	import type { EditorStore } from '../editor-store.svelte';
	import type { EditorInteractionStore } from '../store/editor-interaction-store.svelte';
	import type { EditorGizmoCapabilities } from '../gizmo/editor-gizmo-policy';

export type EditorShortcutHost = {
	getViewportElement: () => HTMLElement | null | undefined;
	getOutlinerElement: () => HTMLElement | null | undefined;
	getClusterNameInput: () => HTMLInputElement | null | undefined;
};

function isEditableTarget(target: EventTarget | null) {
	if (typeof HTMLElement === 'undefined') return false;
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}	export function createEditorShortcutHandler(
		store: EditorStore,
		host: EditorShortcutHost,
		interactionStore?: EditorInteractionStore,
		deselectActive?: () => void,
		/**
		 * true while the active domain is a detached S7 layout selection.
		 * Layout publishes no interactive gizmo policy until S8, so W/E/R/T/X are
		 * refused (the remembered scene mode is never touched). Absent on the relic.
		 */
		isLayoutSelectionActive?: () => boolean,
		/**
		 * step 6 — the active target's generic capability projection used
		 * by the toolbar/host. W/E/R/T refuse modes the target does not allow;
		 * `null` (no interactive target) lets the keys set the remembered tool.
		 * Absent on the relic, which refuses via the legacy camera restriction.
		 */
		getGizmoCapabilities?: () => EditorGizmoCapabilities | null
	) {
	function editorOwnsSceneShortcuts() {
		if (typeof document === 'undefined') return false;
		const active = document.activeElement;
		if (!active) return false;
		const viewportElement = host.getViewportElement();
		if (viewportElement?.contains(active)) return true;
		const outlinerElement = host.getOutlinerElement();
		return Boolean(
			store.currentWorkspace === 'scene' &&
				store.leftPanel === 'scene' &&
				outlinerElement?.contains(active)
		);
	}

	function editorOwnsCameraShortcuts() {
		if (store.currentWorkspace !== 'camera') return false;
		if (typeof document === 'undefined') return false;
		const active = document.activeElement;
		if (!active) return false;
		const viewportElement = host.getViewportElement();
		const outlinerElement = host.getOutlinerElement();
		return Boolean(
			viewportElement?.contains(active) || outlinerElement?.contains(active)
		);
	}

	function ungroupSelection() {
		const cluster = store.selectedCluster;
		if (!cluster || !store.ungroupCluster(cluster.id)) return;
		store.removeClusterTreeExpansion(cluster.id);
		store.setStatusMessage(`Ungrouped ${cluster.name}`);
	}

	async function groupSelection() {
		const clusterId = store.createCluster();
		if (!clusterId) return;
		const cluster = store.selectedCluster;
		if (cluster) store.ensureRoomTreeExpanded(cluster.roomId);
		store.ensureClusterTreeExpanded(clusterId);
		store.focusSelection();
		await tick();
		if (store.selectedClusterId !== clusterId) return;
		const clusterNameInput = host.getClusterNameInput();
		clusterNameInput?.focus();
		clusterNameInput?.select();
	}

	return (event: KeyboardEvent) => {
		if (event.defaultPrevented) return;
		if (store.cameraPreview) {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				store.stopCameraPreview();
				return;
			}
			if (store.isDocumentMutationBlocked) return;
		}
		if (isEditableTarget(event.target)) return;
		const modifier = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		const sceneOwnsShortcuts = editorOwnsSceneShortcuts();
		const cameraOwnsShortcuts = editorOwnsCameraShortcuts();

		if (modifier && key === 'z') {			event.preventDefault();
			if (event.shiftKey) store.redo();
			else store.undo();
		} else if (modifier && event.ctrlKey && key === 'y') {
			event.preventDefault();
			store.redo();
		} else if (
			modifier &&
			!event.shiftKey &&
			!event.altKey &&
			key === 'd' &&
			sceneOwnsShortcuts &&
			store.selectedPlacementIds.length > 0
		) {
			if (store.duplicateSelection()) {
				event.preventDefault();
				event.stopPropagation();
			}
		} else if (modifier && key === 'g' && sceneOwnsShortcuts) {
			event.preventDefault();
			event.stopPropagation();
			if (event.shiftKey) ungroupSelection();
			else void groupSelection();
		} else if (modifier && key === 'a' && sceneOwnsShortcuts) {
			event.preventDefault();
			event.stopPropagation();
			store.selectionActions.selectAllInRoom();
		} else if (
			!modifier &&
			!event.altKey &&
			(event.key === 'Delete' || event.key === 'Backspace') &&
			cameraOwnsShortcuts
		) {
			const selection = store.navigationSelection;
			const deleted =
				selection?.kind === 'node' && !store.isPendingNavigationNode(selection.nodeId)
					? store.deleteNavigationNode(selection.nodeId)
					: selection?.kind === 'anchor'
						? store.deleteSelectedAnchor()
						: selection?.kind === 'connection'
							? store.deleteConnection(selection.connectionId)
							: false;
			if (deleted) {
				event.preventDefault();
				event.stopPropagation();
			}
		} else if (
			!modifier &&
			!event.altKey &&
			(event.key === 'Delete' || event.key === 'Backspace') &&
			sceneOwnsShortcuts &&
			store.selectedPlacementIds.length > 0
		) {
			if (store.deleteSelection()) {
				event.preventDefault();
				event.stopPropagation();
			}
		} else if (!modifier && !event.altKey && event.key === 'End' && sceneOwnsShortcuts) {
			event.preventDefault();
			store.requestDropToFloor();
		} else if (!modifier && !event.altKey && key === 'f' && sceneOwnsShortcuts) {
			event.preventDefault();
			store.focusSelection();
		} else if (interactionStore && !modifier && !event.altKey && !event.shiftKey) {
			// Escape must stay reachable in editor: the mode-key branch above would
			// otherwise swallow it (else-if), so run the cancel cascade before
			// the W/E/R/T handling. Kept inline for parity with the relic branch.
			if (event.key === 'Escape') {
				if (store.transformInteractionActive) return;
				if (store.cancelPendingNavigation('Camera command cancelled')) {
					event.preventDefault();
					return;
				}
				if (store.cancelAssetPlacement('Placement cancelled')) {
					event.preventDefault();					return;
				}
				if (store.finishAnchorEditing()) {
					event.preventDefault();
					return;
				}
				if (store.finishViewKeyframeEditing()) {
					event.preventDefault();
					return;
				}
				// Escape deselects whichever domain is active.
				if (deselectActive) deselectActive();
				else if (sceneOwnsShortcuts) store.selectionActions.deselect();
				return;
			}
			// Phase 6.1 section 3 — Unity-style gizmo mode keybinds. W = translate,
		// E = rotate, R = scale, T = translate alias, X = toggle Space.
		// Bind here BEFORE the long modifier chains so plain key presses resolve.
		// a detached layout selection is not interactive: refuse the
		// mode keys entirely so they never touch the remembered scene mode.
		if (isLayoutSelectionActive?.()) return;
		const inPreview = store.cameraPreview !== null;
		// step 6 — refuse modes the active target's policy does not allow
		// (the same effective policy the toolbar/host uses). Relic camera
		// targets are translate-only, matching the toolbar's existing
		// restriction; `null` caps (no interactive target) keep the keys live.
		const modeForKey =
			key === 'w' || key === 't'
				? 'translate'
				: key === 'e'
					? 'rotate'
					: key === 'r'
						? 'scale'
						: null;
		if (modeForKey) {
			const caps = getGizmoCapabilities?.();
			const hasNavigationTransform =
				store.navigationSelection?.kind === 'node' ||
				store.navigationSelection?.kind === 'anchor' ||
				store.navigationSelection?.kind === 'view-keyframe';
			const refused =
				(caps !== undefined && caps !== null && !caps.allowedModes.has(modeForKey)) ||
				(caps === undefined && hasNavigationTransform && modeForKey !== 'translate');
			if (refused) return;
		}
		if (key === 'w' || key === 't') {
			interactionStore.setMode('translate');
			if (inPreview) return;
			event.preventDefault();
			return;
		}
		if (key === 'e') {
			interactionStore.setMode('rotate');
			if (inPreview) return;
			event.preventDefault();
			return;
		}
		if (key === 'r') {
			interactionStore.setMode('scale');
			if (inPreview) return;
			event.preventDefault();
			return;
		}
		if (key === 'x') {
			interactionStore.toggleSpace();
			event.preventDefault();
			return;
		}
	} else if (!modifier && !event.altKey && event.key === 'Escape') {
			if (store.transformInteractionActive) return;
			if (store.cancelPendingNavigation('Camera command cancelled')) {
				event.preventDefault();
				return;
			}
			if (store.cancelAssetPlacement('Placement cancelled')) {
				event.preventDefault();
				return;
			}
			if (store.finishAnchorEditing()) {
				event.preventDefault();
				return;
			}
			if (store.finishViewKeyframeEditing()) {
				event.preventDefault();
				return;
			}
			// Escape deselects whichever domain is active; the default
			// keeps the legacy scene-owned deselect for the relic.
			if (deselectActive) deselectActive();
			else if (sceneOwnsShortcuts) store.selectionActions.deselect();
		}
	};
}

export function registerEditorShortcuts(
	store: EditorStore,
	host: EditorShortcutHost,
	interactionStore?: EditorInteractionStore,
	deselectActive?: () => void,
	isLayoutSelectionActive?: () => boolean,
	getGizmoCapabilities?: () => EditorGizmoCapabilities | null
) {
	const onKeyDown = createEditorShortcutHandler(
		store,
		host,
		interactionStore,
		deselectActive,
		isLayoutSelectionActive,
		getGizmoCapabilities
	);
	window.addEventListener('keydown', onKeyDown);
	return () => window.removeEventListener('keydown', onKeyDown);
}
