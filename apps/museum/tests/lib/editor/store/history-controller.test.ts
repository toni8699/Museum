import { describe, expect, it } from 'vitest';

import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import type { MuseumSceneDocument } from '$lib/content/scene';

import {
	cloneMuseumSceneDocument,
	EditorDocumentStore
} from '$lib/editor/store/document-store.svelte';
import { EditorCameraPreviewController } from '$lib/editor/store/camera-preview-controller.svelte';
import { EditorHistoryController } from '$lib/editor/store/history-controller.svelte';

function fingerprint(doc: MuseumSceneDocument): MuseumSceneDocument {
	const next = cloneMuseumSceneDocument(doc);
	const first = next.entities[0];
	if (!first) throw new Error('scene document has no entities');
	first.rotation = [
		first.rotation[0],
		first.rotation[1] + 0.001,
		first.rotation[2]
	] as typeof first.rotation;
	return next;
}

function makeControllers() {
	const document = new EditorDocumentStore(cloneFixtureDocument());
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
		const seedRotation = document.document.entities[0]!.rotation[1];
		expect(history.beginDocument()).toBe(true);
		const result = history.commit(fingerprint(document.document));
		expect(result.changed).toBe(true);
		expect(result.type).toBe('doc');
		expect(history.pastDepth).toBe(1);
		expect(history.version).toBeGreaterThan(0);
		expect(document.document.entities[0]!.rotation[1]).not.toBe(seedRotation);
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
		const { document, history } = makeControllers();
		expect(history.beginFraming()).toBe(true);
		expect(history.isFramingTransactionActive).toBe(true);
		expect(history.isDocumentUndoBlocked).toBe(true);
		const result = history.commit(fingerprint(document.document));
		expect(result.changed).toBe(true);
		expect(result.type).toBe('framing');
		expect(history.isFramingTransactionActive).toBe(false);
	});

	it('undo() restores the previous document, redo() restores the future one', () => {
		const { document, history } = makeControllers();
		const originalRotation = document.document.entities[0]!.rotation[1];
		expect(history.beginDocument()).toBe(true);
		history.commit(fingerprint(document.document));
		const aRotation = document.document.entities[0]!.rotation[1];
		expect(aRotation).not.toBe(originalRotation);
		expect(history.beginDocument()).toBe(true);
		const b = fingerprint(document.document);
		b.entities[0]!.rotation[1] = aRotation + 0.002;
		history.commit(b);
		const bRotation = document.document.entities[0]!.rotation[1];
		expect(bRotation).not.toBe(aRotation);
		expect(history.pastDepth).toBe(2);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(false);

		expect(history.undo()).toBe(true);
		expect(document.document.entities[0]!.rotation[1]).toBe(aRotation);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(true);

		expect(history.undo()).toBe(true);
		expect(document.document.entities[0]!.rotation[1]).toBe(originalRotation);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);

		expect(history.redo()).toBe(true);
		expect(document.document.entities[0]!.rotation[1]).toBe(aRotation);
	});

	it('cancel() restores the pre-transaction snapshot', () => {
		const { document, history } = makeControllers();
		const originalRotation = document.document.entities[0]!.rotation[1];

		expect(history.isDocumentUndoBlocked).toBe(false);
		expect(history.beginDocument()).toBe(true);
		expect(history.isDocumentUndoBlocked).toBe(true);
		document.replace(fingerprint(document.document));
		expect(document.document.entities[0]!.rotation[1]).not.toBe(originalRotation);

		expect(history.cancel()).toBe(true);
		expect(document.document.entities[0]!.rotation[1]).toBe(originalRotation);
		expect(history.isDocumentUndoBlocked).toBe(false);
	});

	it('cancel() refuses when no transaction is in flight', () => {
		const { history } = makeControllers();
		expect(history.cancel()).toBe(false);
	});

	it('clear() empties past + future + resets transaction state', () => {
		const { document, history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		history.commit(fingerprint(document.document));
		expect(history.undo()).toBe(true);
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
		const { document, history, preview } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		const first = fingerprint(document.document);
		history.commit(first);
		expect(history.beginDocument()).toBe(true);
		const second = fingerprint(document.document);
		second.entities[0]!.rotation[1] = first.entities[0]!.rotation[1] + 0.005;
		history.commit(second);
		expect(history.pastDepth).toBe(2);
		expect(history.undo()).toBe(true);
		expect(history.pastDepth).toBe(1);
		expect(history.futureDepth).toBe(1);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(true);
		preview['preview'] = {
			kind: 'transition',
			fromNodeId: 'tour-paris',
			toNodeId: 'tour-d',
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

	it('interleaves layout and scene entries without overwriting the other domain', () => {
		const { document, history } = makeControllers();
		let layout = { value: 0 };
		history.registerLayoutHost({
			capture: () => ({ ...layout }),
			replace: (snapshot) => { layout = { ...(snapshot as { value: number }) }; },
			matches: (a, b) => JSON.stringify(a) === JSON.stringify(b)
		});
		const originalSceneRotation = document.document.entities[0]!.rotation[1];
		expect(history.beginLayout()).toBe(true);
		layout = { value: 1 };
		expect(history.commitLayout({ value: 1 }).domain).toBe('layout');
		expect(history.beginDocument()).toBe(true);
		history.commit(fingerprint(document.document));
		expect(history.undo()).toBe(true);
		expect(layout.value).toBe(1);
		expect(document.document.entities[0]!.rotation[1]).toBe(originalSceneRotation);
		expect(history.undo()).toBe(true);
		expect(layout.value).toBe(0);
	});

	it('re-entrant beginDocument refuses while a transaction is in flight', () => {
		const { history } = makeControllers();
		expect(history.beginDocument()).toBe(true);
		expect(history.beginDocument()).toBe(false);
		expect(history.beginFraming()).toBe(false);
	});

	it('commit without beginDocument refuses (no-op + clears the state)', () => {
		const { history, document } = makeControllers();
		const beforeRotation = document.document.entities[0]!.rotation[1];
		const result = history.commit(fingerprint(document.document));
		expect(result).toEqual({ changed: false, type: null, error: null });
		expect(document.document.entities[0]!.rotation[1]).toBe(beforeRotation);
	});
});
