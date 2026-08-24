import { describe, expect, it, vi } from 'vitest';

import {
	clampMenuPosition,
	createEditorContextMenuStore,
	type ContextMenuItem
} from '$lib/editor/context-menu/context-menu-state.svelte';
import { isEditableElement, isEditableTarget } from '$lib/editor/context-menu/editable-target';
import { resolveSelectionBeforeMenu } from '$lib/editor/context-menu/selection-before-menu';
import { buildSceneEntityContextMenuItems } from '$lib/editor/context-menu/scene-menu-items';
import {
	buildArrangeContextMenuItems,
	buildPlanLayoutContextMenuItems
} from '$lib/editor/context-menu/plan-menu-items';
import {
	buildCameraConnectionContextMenuItems,
	buildCameraNodeContextMenuItems,
	buildViewKeyframeContextMenuItems
} from '$lib/editor/context-menu/camera-menu-items';

describe('editable-target interception (P3.4)', () => {
	it('keeps the native menu for inputs, textareas, selects, and contentEditable', () => {
		expect(isEditableElement({ tagName: 'input' })).toBe(true);
		expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true);
		expect(isEditableElement({ tagName: 'select' })).toBe(true);
		expect(isEditableElement({ tagName: 'div', isContentEditable: true })).toBe(true);
	});

	it('does not intercept non-editable elements or non-element targets', () => {
		expect(isEditableElement({ tagName: 'svg' })).toBe(false);
		expect(isEditableElement({})).toBe(false);
		expect(isEditableElement(null)).toBe(false);
	});
});

describe('selection-before-menu contract (P3.4)', () => {
	it('selects an unselected target before opening', () => {
		expect(resolveSelectionBeforeMenu({ targetSelected: false, selectionSize: 0 })).toBe(
			'select-target'
		);
	});

	it('keeps a multi-selection when the target is already a member', () => {
		// Regression: re-selecting a member must not collapse the selection,
		// which would change what duplicate/delete act on.
		expect(resolveSelectionBeforeMenu({ targetSelected: true, selectionSize: 3 })).toBe(
			'keep-selection'
		);
	});
});

describe('context menu store + positioning', () => {
	it('opens one menu at a time and closes it', () => {
		const store = createEditorContextMenuStore();
		expect(store.menu).toBeNull();
		store.open({ surfaceId: 'scene-3d', x: 10, y: 10, items: [] });
		expect(store.menu?.surfaceId).toBe('scene-3d');
		store.open({ surfaceId: 'outliner', x: 20, y: 20, items: [] });
		expect(store.menu?.surfaceId).toBe('outliner');
		store.close();
		expect(store.menu).toBeNull();
	});

	it('clamps the anchored menu inside the viewport and flips when overflowing', () => {
		expect(clampMenuPosition(10, 10, 100, 80, 800, 600)).toEqual({ x: 10, y: 10 });
		// bottom-right overflow flips up/left
		expect(clampMenuPosition(795, 590, 100, 80, 800, 600)).toEqual({
			x: 800 - 100 - 8,
			y: 600 - 80 - 8
		});
	});
});

describe('Scene entity menu model (P3.4)', () => {
	const baseActions = {
		duplicate: vi.fn(),
		focus: vi.fn(),
		toggleVisibility: vi.fn(),
		deleteSelection: vi.fn()
	};

	it('exposes Duplicate · Focus · Hide · Delete with danger delete last', () => {
		const items = buildSceneEntityContextMenuItems({
			targetHidden: false,
			mutationBlockedReason: null,
			actions: baseActions
		});
		expect(items.map((item) => item.id)).toEqual([
			'duplicate',
			'focus',
			'toggle-visibility',
			'delete'
		]);
		expect(items[3]!.danger).toBe(true);
		expect(items.find((item) => item.id === 'toggle-visibility')?.label).toBe('Hide');
	});

	it('reflects session visibility state as Show', () => {
		const items = buildSceneEntityContextMenuItems({
			targetHidden: true,
			mutationBlockedReason: null,
			actions: baseActions
		});
		expect(items.find((item) => item.id === 'toggle-visibility')?.label).toBe('Show');
	});

	it('renders disabled-with-reason for blocked document mutations', () => {
		const items = buildSceneEntityContextMenuItems({
			targetHidden: false,
			mutationBlockedReason: 'Preview is active',
			actions: baseActions
		});
		const duplicateItem = items.find((item) => item.id === 'duplicate')!;
		const deleteItem = items.find((item) => item.id === 'delete')!;
		expect(duplicateItem.disabledReason).toBe('Preview is active');
		expect(deleteItem.disabledReason).toBe('Preview is active');
		// Visibility is session-only state — never document-mutation blocked.
		expect(items.find((item) => item.id === 'toggle-visibility')!.disabledReason ?? null).toBeNull();
	});
});

describe('Plan menu models (P3.4 — post-P10 routing)', () => {
	it('Layout mode room target offers Rename + Delete only', () => {
		const items = buildPlanLayoutContextMenuItems({
			target: { kind: 'room', roomId: 'room:1' },
			mutationBlockedReason: null,
			actions: {
				renameRoom: vi.fn(),
				deleteRoom: vi.fn(),
				deleteOpening: vi.fn(),
				deleteObject: vi.fn()
			}
		});
		expect(items.map((item) => item.id)).toEqual(['rename-room', 'delete-room']);
	});

	it('disables room Rename with the active layout mutation reason', () => {
		const items = buildPlanLayoutContextMenuItems({
			target: { kind: 'room', roomId: 'room:1' },
			mutationBlockedReason: 'Preview is active',
			actions: {
				renameRoom: vi.fn(),
				deleteRoom: vi.fn(),
				deleteOpening: vi.fn(),
				deleteObject: vi.fn()
			}
		});
		expect(items.find((item) => item.id === 'rename-room')?.disabledReason).toBe(
			'Preview is active'
		);
	});

	it('opening targets offer Delete; object targets offer Delete', () => {
		const actions = {
			renameRoom: vi.fn(),
			deleteRoom: vi.fn(),
			deleteOpening: vi.fn(),
			deleteObject: vi.fn()
		};
		expect(
			buildPlanLayoutContextMenuItems({
				target: { kind: 'opening', roomId: 'r', openingId: 'o' },
				mutationBlockedReason: null,
				actions
			}).map((item) => item.label)
		).toEqual(['Delete opening']);
		expect(
			buildPlanLayoutContextMenuItems({
				target: { kind: 'object', objectId: 'obj' },
				mutationBlockedReason: null,
				actions
			}).map((item) => item.label)
		).toEqual(['Delete object']);
	});

	it('Arrange routes layout-object targets through Layout commands only', () => {
		const deleteLayoutObject = vi.fn();
		const duplicateScene = vi.fn();
		const items = buildArrangeContextMenuItems({
			target: { owner: 'layout-object', objectId: 'obj' },
			mutationBlockedReason: null,
			actions: {
				deleteLayoutObject,
				duplicateScene,
				focusScene: vi.fn(),
				toggleSceneVisibility: vi.fn(),
				deleteScene: vi.fn()
			}
		});
		expect(items.map((item) => item.id)).toEqual(['delete-layout-object']);
		items[0]!.run();
		expect(deleteLayoutObject).toHaveBeenCalledWith('obj');
		expect(duplicateScene).not.toHaveBeenCalled();
	});

	it('Arrange routes scene targets through the existing Scene command set', () => {
		const focusScene = vi.fn();
		const items = buildArrangeContextMenuItems({
			target: { owner: 'scene', entityId: 'entity:1' },
			mutationBlockedReason: null,
			actions: {
				deleteLayoutObject: vi.fn(),
				duplicateScene: vi.fn(),
				focusScene,
				toggleSceneVisibility: vi.fn(),
				deleteScene: vi.fn()
			}
		});
		expect(items.map((item) => item.id)).toEqual([
			'duplicate',
			'focus',
			'toggle-visibility',
			'delete'
		]);
		items.find((item) => item.id === 'focus')!.run();
		expect(focusScene).toHaveBeenCalledWith('entity:1');
	});

	it('Apply the Arrange Scene authority gate as the disabled reason', () => {
		const items = buildArrangeContextMenuItems({
			target: { owner: 'scene', entityId: 'e' },
			mutationBlockedReason: null,
			sceneAuthorityBlockedReason: 'Selection contains items that are not editable in Plan',
			actions: {
				deleteLayoutObject: vi.fn(),
				duplicateScene: vi.fn(),
				focusScene: vi.fn(),
				toggleSceneVisibility: vi.fn(),
				deleteScene: vi.fn()
			}
		});
		for (const item of items) {
			if (item.id === 'toggle-visibility') continue;
			expect(item.disabledReason).toBe('Selection contains items that are not editable in Plan');
		}
	});
});

describe('Camera menu models (P3.5 — backing identities)', () => {
	it('node menus bind sequence membership state to Add/Remove reasons', () => {
		const free = buildCameraNodeContextMenuItems({
			spatial: true,
			nodeOnSequence: false,
			mutationBlockedReason: null,
			actions: {
				previewCamera: vi.fn(),
				addToSequence: vi.fn(),
				removeFromSequence: vi.fn(),
				rename: vi.fn(),
				deleteNode: vi.fn()
			}
		});
		const remove = free.find((item) => item.id === 'remove-from-sequence')!;
		expect(remove.disabledReason).toBe('Not on the camera flow');

		const guided = buildCameraNodeContextMenuItems({
			spatial: true,
			nodeOnSequence: true,
			mutationBlockedReason: null,
			actions: {
				previewCamera: vi.fn(),
				addToSequence: vi.fn(),
				removeFromSequence: vi.fn(),
				rename: vi.fn(),
				deleteNode: vi.fn()
			}
		});
		expect(guided.find((item) => item.id === 'add-to-sequence')?.disabledReason).toBe(
			'Already on the camera flow'
		);
	});

	it('Camera 3D variant drops Plan-only spatial rows but keeps commands', () => {
		const items: ContextMenuItem[] = buildCameraNodeContextMenuItems({
			spatial: false,
			nodeOnSequence: false,
			mutationBlockedReason: null,
			actions: {
				previewCamera: vi.fn(),
				addToSequence: vi.fn(),
				removeFromSequence: vi.fn(),
				rename: vi.fn(),
				deleteNode: vi.fn()
			}
		});
		expect(items.map((item) => item.id)).not.toContain('add-to-sequence');
		expect(items.map((item) => item.id)).toContain('preview-camera');
		expect(items.map((item) => item.id)).toContain('remove-from-sequence');
	});

	it('connection menus offer Timing · Reverse · Delete', () => {
		const items = buildCameraConnectionContextMenuItems({
			mutationBlockedReason: null,
			actions: { openTiming: vi.fn(), toggleReverse: vi.fn(), deleteConnection: vi.fn() }
		});
		expect(items.map((item) => item.id)).toEqual(['timing', 'reverse', 'delete-connection']);
	});

	it('view-keyframe menus expose only the backing keyframe identity action', () => {
		const deleteKeyframe = vi.fn();
		const items = buildViewKeyframeContextMenuItems({
			mutationBlockedReason: null,
			actions: { deleteKeyframe }
		});
		expect(items.length).toBe(1);
		expect(items[0]!.id).toBe('delete-keyframe');
	});
});
