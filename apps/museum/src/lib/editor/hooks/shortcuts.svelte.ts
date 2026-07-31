/**
 * Slice 8 — editor keyboard shortcut cascade (app shell only).
 *
 * Escape order (audit §7 #4 / F16) must stay:
 * cameraPreview → stopCameraPreview (early return)
 * then (when not editing fields):
 * cancelPendingNavigation → cancelAssetPlacement → finishAnchorEditing →
 * finishViewKeyframeEditing → deselect (scene-owned only)
 */

import { tick } from 'svelte';
import type { MuseumEditorStore } from '../museum-editor.svelte';

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
}

export function createEditorShortcutHandler(
	store: MuseumEditorStore,
	host: EditorShortcutHost
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
		store.ensureRoomTreeExpanded('paris');
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

		if (modifier && key === 'z') {
			event.preventDefault();
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
			if (sceneOwnsShortcuts) store.selectionActions.deselect();
		}
	};
}

export function registerEditorShortcuts(
	store: MuseumEditorStore,
	host: EditorShortcutHost
) {
	const onKeyDown = createEditorShortcutHandler(store, host);
	window.addEventListener('keydown', onKeyDown);
	return () => window.removeEventListener('keydown', onKeyDown);
}
