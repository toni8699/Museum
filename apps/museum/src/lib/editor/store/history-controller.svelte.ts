/**
 * `EditorHistoryController` — the undo/redo + transaction FSM.
 *
 * Slice 3 of the museum-editor refactor plan lifts `#past`, `#future`,
 * `#transactionBefore`, `#cameraFramingTransaction`, `historyVersion`, the
 * `begin/commit/cancel/undo/redo` method zoo, and the `#bumpHistoryVersion`
 * helper out of `museum-editor.svelte.ts`.
 *
 * **Critical atomic constraint** (audit §3.A.2 / F6): `canUndo` cannot be a
 * pure data predicate. When the camera preview is `playing`, undo is
 * blocked. This is why the history controller takes the camera preview
 * controller as a constructor collaborator — not the underlying `preview`
 * field. The peer-link is the entire coupling; nothing else crosses the
 * boundary.
 *
 * **Coupling to document store.** Every commit / undo / redo path calls
 * `EditorDocumentStore.replace(next)` which atomically rebuilds the
 * runtime scene + state AND fires `afterReplace` listeners (which the
 * composition root registers to refresh the preview + reconcile
 * selection). This keeps history's responsibility focused on stack mgmt.
 *
 * **API parity with pre-slice god-file.** `beginDocument()` mirrors
 * `beginDocumentTransaction` (sets `#transactionBefore`, plus `false` for
 * `#framingTransaction`). `beginFraming()` mirrors
 * `beginCameraFramingTransaction`. `cancel()` always restores the pre-
 * transaction document (the composition root cancels any in-flight
 * framing drag BEFORE this call returns false).
 */

import { untrack } from 'svelte';

import { resolveSceneDocument, type MuseumSceneDocument } from '$lib/content/scene';

import {
	EditorDocumentStore,
	cloneMuseumSceneDocument
} from './document-store.svelte';
import type { EditorCameraPreviewController } from './camera-preview-controller.svelte';

/**
 * Cap mirrors the pre-slice god-file's `HISTORY_LIMIT = 100` (line 112).
 * Slice 6 keeps the constant on the controller when it absorbs the
 * god-file's originals.
 */
export const HISTORY_LIMIT = 100;

type CommitKind = 'doc' | 'framing';

export type HistoryCommitResult = {
	changed: boolean;
	type: CommitKind | null;
	/** Set when resolver validation fails; facade posts via setStatusMessage. */
	error: Error | null;
};

export class EditorHistoryController {
	/** Counter consumed by `$derived` getters via `void`. */
	version = $state(0);

	/**
	 * The pre-transaction document snapshot. Set by `beginDocument` or
	 * `beginFraming`, consumed by `commit` / `cancel`.
	 */
	#before: MuseumSceneDocument | null = null;

	/** Stack of "undo" snapshot documents, oldest at index 0. */
	#past: MuseumSceneDocument[] = [];

	/** Stack of "redo" snapshot documents. */
	#future: MuseumSceneDocument[] = [];

	/** Distinguishes a `beginFraming()` from a regular document transaction. */
	#framingTransaction = false;

	constructor(
		private readonly document: EditorDocumentStore,
		private readonly preview: EditorCameraPreviewController
	) {}

	// ============================================================
	// Transactions
	// ============================================================

	/** Begin a regular document transaction. */
	beginDocument(): boolean {
		if (this.#before) return false;
		this.#before = cloneMuseumSceneDocument(this.document.document);
		this.#framingTransaction = false;
		return true;
	}

	/** Begin a camera-framing transaction. */
	beginFraming(): boolean {
		if (this.#before) return false;
		this.#before = cloneMuseumSceneDocument(this.document.document);
		this.#framingTransaction = true;
		return true;
	}

	/**
	 * Commit the in-flight transaction. Validates via `resolveSceneDocument`
	 * BEFORE mutating stacks (pre-slice god-file order). On resolver failure:
	 * restores `before`, returns `{ changed:false, error }` so the facade can
	 * `setStatusMessage`. On no-op `documentsMatch`: clears tx, no stack push.
	 */
	commit(next: MuseumSceneDocument): HistoryCommitResult {
		const before = this.#before;
		if (!before) return { changed: false, type: null, error: null };
		const type: CommitKind = this.#framingTransaction ? 'framing' : 'doc';

		if (EditorDocumentStore.documentsMatch(before, next)) {
			this.#before = null;
			this.#framingTransaction = false;
			return { changed: false, type: null, error: null };
		}

		try {
			resolveSceneDocument(next);
		} catch (error) {
			this.#before = null;
			this.#framingTransaction = false;
			this.document.replace(before);
			return {
				changed: false,
				type: null,
				error: error instanceof Error ? error : new Error(String(error))
			};
		}

		this.#before = null;
		this.#framingTransaction = false;
		this.#past.push(before);
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		this.document.replace(next);
		this.#bumpVersion();
		return { changed: true, type, error: null };
	}

	/**
	 * Cancel the in-flight transaction. The composition root is responsible
	 * for any framing-drag `canceler()` that must run first; if that
	 * returns false, the facade surfaces a status message and skips this
	 * call. Always restores the pre-transaction snapshot when invoked.
	 */
	cancel(): boolean {
		const before = this.#before;
		if (!before) return false;
		this.#before = null;
		this.#framingTransaction = false;
		this.document.replace(before);
		return true;
	}

	// ============================================================
	// Undo / Redo
	// ============================================================

	undo(): boolean {
		const previous = this.#past.pop();
		if (!previous) return false;
		this.#future.push(cloneMuseumSceneDocument(this.document.document));
		if (this.#future.length > HISTORY_LIMIT) this.#future.shift();
		this.document.replace(previous);
		this.preview.pruneIfStale();
		this.#bumpVersion();
		return true;
	}

	redo(): boolean {
		const next = this.#future.pop();
		if (!next) return false;
		this.#past.push(cloneMuseumSceneDocument(this.document.document));
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.document.replace(next);
		this.preview.pruneIfStale();
		this.#bumpVersion();
		return true;
	}

	/** Cleared by `importDocument` / `resetToCheckedInDocument`. */
	clear(): void {
		this.#past = [];
		this.#future = [];
		this.#before = null;
		this.#framingTransaction = false;
		this.#bumpVersion();
	}

	// ============================================================
	// Peer-link surface (audit §3.A.2)
	// ============================================================

	/**
	 * Narrow peer-link predicate (transport === playing). Composition root
	 * `canUndo` is richer (interaction + any non-paused transport + pending
	 * nav) — do not replace the facade wholesale with this getter.
	 */
	get canUndo(): boolean {
		if (this.preview.transportState === 'playing') return false;
		if (this.#before) return false;
		return this.#past.length > 0;
	}

	/** Redo allowed when future is non-empty and no peer-link block applies. */
	get canRedo(): boolean {
		if (this.preview.transportState === 'playing') return false;
		if (this.#before) return false;
		return this.#future.length > 0;
	}

	/** True when an in-flight transaction is open (`#before !== null`). */
	get isDocumentUndoBlocked(): boolean {
		return this.#before !== null;
	}

	get pastDepth(): number {
		return this.#past.length;
	}

	get futureDepth(): number {
		return this.#future.length;
	}

	get isFramingTransactionActive(): boolean {
		return this.#before !== null && this.#framingTransaction;
	}

	#bumpVersion(): void {
		untrack(() => {
			this.version += 1;
		});
	}
}
