import { describe, expect, it } from 'vitest';

import { createEmptySceneDocument } from '$lib/content/scene';
import { serializeLayoutDocument } from '$lib/layout/layout-codec';
import { chopinRuntime, sceneDocument } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	commitLayoutObject,
	commitLayoutOpening,
	createEmptyLayoutPreviewState,
	deleteLayoutObject,
	deleteLayoutOpening,
	deleteLayoutRoom,
	restoreLayoutPreviewSnapshot,
	updateLayoutObjectFields,
	updateLayoutOpeningFields,
	updateLayoutRoomFields
} from '$lib/editor/layout/layout-preview-state.svelte';
import {
	layoutMutationRunnerFor,
	runLayoutMutation,
	type LayoutMutationRunner
} from '$lib/editor/layout/layout-mutation-runner';

function makeStore() {
	const store = createEditorStore({
		document: sceneDocument,
		rooms: chopinRuntime.rooms
	});
	const layoutPreview = createEmptyLayoutPreviewState();
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) =>
			restoreLayoutPreviewSnapshot(layoutPreview, snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>),
		matches: (a, b) =>
			JSON.stringify((a as { project: { layout: unknown } }).project.layout) ===
			JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});
	const runner = layoutMutationRunnerFor(store, layoutPreview);
	return { store, layoutPreview, runner };
}

function draftRoom(layoutPreview: ReturnType<typeof createEmptyLayoutPreviewState>, points: [number, number][]) {
	const result = commitLayoutDraftRoom(layoutPreview, points);
	if (!result.success) throw new Error(`draft room failed: ${result.message}`);
	return result.roomId;
}

/** A single successful mutation must be undoable exactly once (no merged stack). */
function expectExactlyOneUndo(store: ReturnType<typeof createEditorStore>) {
	expect(store.canUndo).toBe(true);
	expect(store.undo()).toBe(true);
	expect(store.canUndo).toBe(false);
	expect(store.undo()).toBe(false);
}

describe('runLayoutMutation', () => {
	it('commits on success and cancels on failure via the supplied runner', () => {
		const calls: string[] = [];
		const runner: LayoutMutationRunner = {
			begin: () => {
				calls.push('begin');
				return true;
			},
			commit: () => {
				calls.push('commit');
				return true;
			},
			cancel: () => {
				calls.push('cancel');
				return false;
			}
		};

		expect(runLayoutMutation(runner, () => 42, (value) => value > 0)).toEqual({
			kind: 'committed',
			result: 42
		});
		expect(calls).toEqual(['begin', 'commit']);

		calls.length = 0;
		expect(runLayoutMutation(runner, () => -1, (value) => value > 0)).toEqual({
			kind: 'cancelled',
			result: -1
		});
		expect(calls).toEqual(['begin', 'cancel']);
	});

	it('returns skipped when no transaction can be opened', () => {
		const runner: LayoutMutationRunner = {
			begin: () => false,
			commit: () => true,
			cancel: () => false
		};
		const outcome = runLayoutMutation(runner, () => 1, () => true);
		expect(outcome).toEqual({ kind: 'skipped' });
	});
});

describe('one undo entry per delete', () => {
	it('object delete', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const created = commitLayoutObject(layoutPreview, 'box', [1, 0.5, 1], roomId);
		if (!created.success) throw new Error('setup failed');
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => deleteLayoutObject(layoutPreview, created.objectId),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.objects).toEqual([]);
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});

	it('opening delete', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const created = commitLayoutOpening(layoutPreview, roomId, `${roomId}:wall:0`, 'door', 1, false);
		if (!created.success) throw new Error('setup failed');
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => deleteLayoutOpening(layoutPreview, roomId, created.openingId),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.floors[0]!.rooms[0]!.openings).toEqual([]);
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});

	it('room delete', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => deleteLayoutRoom(layoutPreview, roomId, createEmptySceneDocument()),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.floors[0]!.rooms).toEqual([]);
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});
});

describe('one undo entry per field edit', () => {
	it('room name edit', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => updateLayoutRoomFields(layoutPreview, roomId, { name: 'Renamed Room' }),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.floors[0]!.rooms[0]!.name).toBe('Renamed Room');
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});

	it('object dimensions edit', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const created = commitLayoutObject(layoutPreview, 'box', [1, 0.5, 1], roomId);
		if (!created.success) throw new Error('setup failed');
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => updateLayoutObjectFields(layoutPreview, created.objectId, { dimensions: [2, 1, 2] }),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.objects[0]!.dimensions).toEqual([2, 1, 2]);
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});

	it('opening width edit', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const created = commitLayoutOpening(layoutPreview, roomId, `${roomId}:wall:0`, 'door', 1, false);
		if (!created.success) throw new Error('setup failed');
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => updateLayoutOpeningFields(layoutPreview, roomId, created.openingId, { width: 1.5 }),
			(result) => result.success
		);
		expect(outcome.kind).toBe('committed');
		expect(layoutPreview.project.layout.floors[0]!.rooms[0]!.openings[0]!.width).toBe(1.5);
		expectExactlyOneUndo(store);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});
});

describe('rejected mutations write no history', () => {
	it('a rejected field edit cancels the transaction', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		const before = serializeLayoutDocument(layoutPreview.project.layout);

		const outcome = runLayoutMutation(
			runner,
			() => updateLayoutRoomFields(layoutPreview, roomId, { name: '   ' }),
			(result) => result.success
		);
		expect(outcome.kind).toBe('cancelled');
		expect(store.canUndo).toBe(false);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(before);
	});

	it('a skipped mutation runs nothing and writes no history', () => {
		const { store, layoutPreview, runner } = makeStore();
		const roomId = draftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(store.beginLayoutTransaction()).toBe(true);

		const outcome = runLayoutMutation(
			runner,
			() => updateLayoutRoomFields(layoutPreview, roomId, { name: 'Should Not Apply' }),
			(result) => result.success
		);
		expect(outcome.kind).toBe('skipped');
		expect(layoutPreview.project.layout.floors[0]!.rooms[0]!.name).toMatch(/^Draft Room/);
		store.cancelLayoutTransaction();
	});
});
