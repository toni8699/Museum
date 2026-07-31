import { describe, expect, it } from 'vitest';

import { museumSceneDocument, type MuseumSceneDocument } from '$lib/content/scene';

import {
	cloneMuseumSceneDocument,
	EditorDocumentStore
} from './document-store.svelte';
import { EditorCameraPreviewController } from './camera-preview-controller.svelte';
import { EditorHistoryController } from './history-controller.svelte';

function fingerprint(doc: MuseumSceneDocument): MuseumSceneDocument {
	const next = cloneMuseumSceneDocument(doc);
	const first = next.objects[0];
	if (!first) throw new Error('museumSceneDocument has no objects');
	first.rotation = [
		first.rotation[0],
		first.rotation[1] + 0.001,
		first.rotation[2]
	] as typeof first.rotation;
	return next;
}

function makeControllers() {
	const document = new EditorDocumentStore();
	const preview = new EditorCameraPreviewController(document);
	const history = new EditorHistoryController(document, preview);
	return { document, preview, history };
}

describe('EditorHistoryController', () => {
	it('starts with empty undo/redo stacks', () => {
		const { history } = makeControllers();
		expect(history.pastDepth).toBe(0);
		expect(history.futureDepth).toBe(0);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.isDocumentUndoBlocked).toBe(false);
		expect(history.isFramingTransactionActive).toBe(false);
	});

	it('commit() pushes onto past and bumps version', () => {
		const { document, history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		const result = history.commit(fingerprint(museumSceneDocument));
		expect(result.changed).toBe(true);
		expect(result.type).toBe('doc');
		expect(history.pastDepth).toBe(1);
		expect(history.version).toBeGreaterThan(0);
		expect(document.document.objects[0]!.rotation[1]).not.toBe(
			museumSceneDocument.objects[0]!.rotation[1]
		);
	});

	it('commit() no-ops when the document is unchanged', () => {
		const { document, history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		const result = history.commit(cloneMuseumSceneDocument(document.document));
		expect(result.changed).toBe(false);
		expect(result.type).toBe(null);
		expect(history.pastDepth).toBe(0);
		expect(history.isDocumentUndoBlocked).toBe(false);
	});

	it('beginFraming + commit marks the framing transaction distinction', () => {
		const { history } = makeControllers();
		expect(history.beginFraming()).toBe(true);
		expect(history.isFramingTransactionActive).toBe(true);
		expect(history.isDocumentUndoBlocked).toBe(true);
		const result = history.commit(fingerprint(museumSceneDocument));
		expect(result.changed).toBe(true);
		expect(result.type).toBe('framing');
		expect(history.isFramingTransactionActive).toBe(false);
	});

	it('undo() restores the previous document, redo() restores the future one', () => {
		const { document, history } = makeControllers();
		const originalRotation = museumSceneDocument.objects[0]!.rotation[1];
		// Mutation A
		expect(history.beginDocument()).toBe(true);
		history.commit(fingerprint(museumSceneDocument));
		const aRotation = document.document.objects[0]!.rotation[1];
		expect(aRotation).not.toBe(originalRotation);
		// Mutation B
		expect(history.beginDocument()).toBe(true);
		const b = fingerprint(museumSceneDocument);
		b.objects[0]!.rotation[1] = aRotation + 0.002;
		history.commit(b);
		const bRotation = document.document.objects[0]!.rotation[1];
		expect(bRotation).not.toBe(aRotation);
		expect(history.pastDepth).toBe(2);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(false);

		// Undo B → A
		expect(history.undo()).toBe(true);
		expect(document.document.objects[0]!.rotation[1]).toBe(aRotation);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(true);

		// Undo A → original
		expect(history.undo()).toBe(true);
		expect(document.document.objects[0]!.rotation[1]).toBe(originalRotation);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);

		// Redo → A
		expect(history.redo()).toBe(true);
		expect(document.document.objects[0]!.rotation[1]).toBe(aRotation);
	});

	it('cancel() restores the pre-transaction snapshot', () => {
		const { document, history } = makeControllers();
		const originalRotation = museumSceneDocument.objects[0]!.rotation[1];

		// Sanity: undo is not blocked at the start of a fresh transaction.
		expect(history.isDocumentUndoBlocked).toBe(false);
		expect(history.beginDocument()).toBe(true);
		// A transaction is now in flight, so undo is blocked.
		expect(history.isDocumentUndoBlocked).toBe(true);
		// Mutate externally (simulates the caller doing work between
		// begin and cancel).
		document.replace(fingerprint(museumSceneDocument));
		expect(document.document.objects[0]!.rotation[1]).not.toBe(originalRotation);

		expect(history.cancel()).toBe(true);
		expect(document.document.objects[0]!.rotation[1]).toBe(originalRotation);
		expect(history.isDocumentUndoBlocked).toBe(false);
	});

	it('cancel() refuses when no transaction is in flight', () => {
		const { history } = makeControllers();
		expect(history.cancel()).toBe(false);
	});

	it('clear() empties past + future + resets transaction state', () => {
		const { history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		history.commit(fingerprint(museumSceneDocument));
		expect(history.undo()).toBe(true);
		// Undo pops past (depth → 0) and pushes current snapshot to future (depth → 1).
		expect(history.pastDepth).toBe(0);
		expect(history.futureDepth).toBe(1);
		history.clear();
		expect(history.pastDepth).toBe(0);
		expect(history.futureDepth).toBe(0);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.isDocumentUndoBlocked).toBe(false);
	});

	it('peer link — canUndo/canRedo are false while preview.transportState === "playing"', () => {
		const { history, preview } = makeControllers();
		// Seed both stacks with TWO distinct commits + one undo so that
		// absent the peer link, canUndo AND canRedo would both be true.
		// Then flip the FSM into playing state and verify both flip.
		expect(history.beginDocument()).toBe(true);
		const first = fingerprint(museumSceneDocument);
		history.commit(first);
		expect(history.beginDocument()).toBe(true);
		const second = fingerprint(museumSceneDocument);
		second.objects[0]!.rotation[1] = first.objects[0]!.rotation[1] + 0.005;
		history.commit(second);
		expect(history.pastDepth).toBe(2);
		expect(history.undo()).toBe(true);
		expect(history.pastDepth).toBe(1);
		expect(history.futureDepth).toBe(1);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(true);
		// Force the FSM into a playing state via the $-state proxy.
		// Bracket notation is intentional — the test rig drives the FSM
		// directly so it doesn't depend on the museum scene's guided-route
		// shape (some test fixtures lack one).
		preview['preview'] = {
			kind: 'transition',
			fromNodeId: 'paris-seat',
			toNodeId: 'paris-departure',
			mode: 'director',
			transport: 'playing',
			runId: 1,
			playhead: 0,
			startedAtMs: null
		};
		expect(preview.transportState).toBe('playing');
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
	});

	it('re-entrant beginDocument refuses while a transaction is in flight', () => {
		const { history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		expect(history.beginDocument()).toBe(false);
		expect(history.beginFraming()).toBe(false);
	});

	it('commit without beginDocument refuses (no-op + clears the state)', () => {
		const { history, document } = makeControllers();
		// Snapshot the document before the no-op commit.
		const beforeRotation = document.document.objects[0]!.rotation[1];
		const result = history.commit(fingerprint(museumSceneDocument));
		expect(result).toEqual({ changed: false, type: null, error: null });
		// No listener fired (no transaction was open), so the document
		// is unchanged. assert it stayed put.
		expect(document.document.objects[0]!.rotation[1]).toBe(beforeRotation);
	});
});
