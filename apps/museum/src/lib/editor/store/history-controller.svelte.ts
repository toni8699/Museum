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

export type HistoryDomain = 'scene' | 'layout';
type CommitKind = 'doc' | 'framing' | 'layout';

export type LayoutHistoryHost = {
	capture(): unknown;
	replace(snapshot: unknown): void;
	matches?(a: unknown, b: unknown): boolean;
};

export type HistoryCommitResult = {
	changed: boolean;
	type: CommitKind | null;
	domain?: HistoryDomain;
	/** Set when resolver validation fails; facade posts via setStatusMessage. */
	error: Error | null;
};

type SceneHistoryEntry = {
	domain: 'scene';
	before: MuseumSceneDocument;
};
type LayoutHistoryEntry = { domain: 'layout'; before: unknown };
type HistoryEntry = SceneHistoryEntry | LayoutHistoryEntry;

export class EditorHistoryController {
	/** Counter consumed by `$derived` getters via `void`. */
	version = $state(0);

	/**
	 * The pre-transaction document snapshot. Set by `beginDocument` or
	 * `beginFraming`, consumed by `commit` / `cancel`.
	 */
	#before: MuseumSceneDocument | null = null;

	/** Chronological undo entries, oldest at index 0. */
	#past: HistoryEntry[] = [];

	/** Chronological redo entries. */
	#future: HistoryEntry[] = [];

	/** Optional layout document host registered by the editor shell. */
	#layoutHost: LayoutHistoryHost | null = null;
	#layoutBefore: unknown = null;

	/** Distinguishes a `beginFraming()` from a regular document transaction. */
	#framingTransaction = false;

	constructor(
		private readonly document: EditorDocumentStore,
		private readonly preview: EditorCameraPreviewController
	) {}

	// ============================================================
	// Transactions
	// ============================================================

	/** Register the preview-only layout document as the second history domain. */
	registerLayoutHost(host: LayoutHistoryHost | null): void {
		this.#layoutHost = host;
	}

	/** Begin a regular scene transaction. */
	beginDocument(): boolean {
		if (this.#before || this.#layoutBefore !== null) return false;
		this.#before = cloneMuseumSceneDocument(this.document.document);
		this.#framingTransaction = false;
		return true;
	}

	/** Begin a layout transaction in the same chronological stack. */
	beginLayout(): boolean {
		if (!this.#layoutHost || this.#before || this.#layoutBefore !== null) return false;
		this.#layoutBefore = this.#layoutHost.capture();
		return true;
	}

	/** Begin a camera-framing transaction. */
	beginFraming(): boolean {
		if (this.#before || this.#layoutBefore !== null) return false;
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
		this.#past.push({ domain: 'scene', before: cloneMuseumSceneDocument(before) });
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		this.document.replace(next);
		this.#bumpVersion();
		return { changed: true, type, error: null };
	}

	/** Commit a layout snapshot as one tagged chronological history entry. */
	commitLayout(next: unknown): HistoryCommitResult {
		const before = this.#layoutBefore;
		const host = this.#layoutHost;
		if (before === null || !host) return { changed: false, type: null, domain: 'layout', error: null };
		const matches = host.matches ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b));
		this.#layoutBefore = null;
		if (matches(before, next)) return { changed: false, type: null, domain: 'layout', error: null };
		this.#past.push({ domain: 'layout', before });
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		host.replace(next);
		this.#bumpVersion();
		return { changed: true, type: 'layout', domain: 'layout', error: null };
	}

	/** Cancel the active scene or layout transaction atomically. */
	cancel(): boolean {
		if (this.#layoutBefore !== null && this.#layoutHost) {
			const before = this.#layoutBefore;
			this.#layoutBefore = null;
			this.#layoutHost.replace(before);
			return true;
		}
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
		if (previous.domain === 'scene') {
			this.#future.push({ domain: 'scene', before: cloneMuseumSceneDocument(this.document.document) });
			this.document.replace(previous.before);
			this.preview.pruneIfStale();
		} else if (this.#layoutHost) {
			this.#future.push({ domain: 'layout', before: this.#layoutHost.capture() });
			this.#layoutHost.replace(previous.before);
		} else {
			this.#past.push(previous);
			return false;
		}
		if (this.#future.length > HISTORY_LIMIT) this.#future.shift();
		this.#bumpVersion();
		return true;
	}

	redo(): boolean {
		const next = this.#future.pop();
		if (!next) return false;
		if (next.domain === 'scene') {
			this.#past.push({ domain: 'scene', before: cloneMuseumSceneDocument(this.document.document) });
			this.document.replace(next.before);
			this.preview.pruneIfStale();
		} else if (this.#layoutHost) {
			this.#past.push({ domain: 'layout', before: this.#layoutHost.capture() });
			this.#layoutHost.replace(next.before);
		} else {
			this.#future.push(next);
			return false;
		}
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#bumpVersion();
		return true;
	}

	/** Cleared by `importDocument` / `resetToCheckedInDocument`. */
	clear(): void {
		this.#past = [];
		this.#future = [];
		this.#before = null;
		this.#layoutBefore = null;
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
		if (this.#before || this.#layoutBefore !== null) return false;
		return this.#past.length > 0;
	}

	/** Redo allowed when future is non-empty and no peer-link block applies. */
	get canRedo(): boolean {
		if (this.preview.transportState === 'playing') return false;
		if (this.#before || this.#layoutBefore !== null) return false;
		return this.#future.length > 0;
	}

	/** True when an in-flight transaction is open (`#before !== null`). */
	get isDocumentUndoBlocked(): boolean {
		return this.#before !== null || this.#layoutBefore !== null;
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
