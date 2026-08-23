/**
 * `EditorDocumentStore` — owns the authoring document + its derived runtime.
 *
 * Slice 3 of the editor-facade refactor plan lifts what used to be five top-of-
 * class fields on `EditorStore` (`document`, `validation`,
 * `baselineCanonicalJson`, `scene`, `state`) plus the `#replaceDocument` /
 * `#rebuildRuntime` / `#replaceRuntime` private dance into one focused sub-store.
 *
 * **Listener pattern.** Every code path that swaps the document (commitDocument
 * Transaction, undo/redo, importDocument, resetToCheckedInDocument) goes through
 * `EditorDocumentStore.replace()`. The composition root registers listeners
 * (preview refresh + camera-timeline prune + selection reconcile — Slice 4)
 * so every swap atomically fires its dependents.
 *
 * **Pure-data invariant.** This sub-store knows nothing about history, preview,
 * selection, or session-state. It owns the document + its derivation + baseline
 * comparison. `HistoryController` reads `documentsMatch()` for its `commit()`
 * no-op detection but never touches the private runtime directly.
 *
 * **Clone cycle.** `cloneSceneDocument` is defined here as an internal
 * helper; the facade keeps its export, and this sub-store owns the local
 * definition.
 */

import {
	serializeSceneDocument,
	validateSceneDocument,
	type SceneDocumentValidationResult
} from '$lib/content/scene-codec';
import {
	createNavigationGraph,
	resolveSceneDocument,
	type SceneDocument,
	type RuntimeScene
} from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';

import { createRuntimeState, type RuntimeStateStore } from '$lib/state/runtime-state.svelte';

export type AfterReplaceListener = () => void;

/**
 * Deep-clone helper used by the document/history sub-stores. Mirrors the
 * pre-slice god-file's `cloneSceneDocument` (line 116) but lives here
 * to break the sub-store ↔ god-file import cycle that would otherwise
 * arise (god-file imports the sub-stores, so sub-stores can't import
 * god-file utilities). Behaviour-identical: deep-equals the underlying
 * JSON shape because every persisted leaf is a primitive, an array of
 * primitives, or a recursively-shaped object.
 */
export function cloneSceneDocument(doc: SceneDocument): SceneDocument {
	return JSON.parse(JSON.stringify(doc)) as SceneDocument;
}

/**
 * Prefer Paris seat when present; otherwise the first navigation node.
 *
 * zero-node policy: returns `null` when the scene has no navigation
 * nodes. A scene with no nodes is a valid authoring state; the session-only
 * free camera has no tour-FSM node yet, so callers treat `null` as "no node
 * authored" instead of throwing.
 */
export function pickInitialNavigationNodeId(scene: RuntimeScene): string | null {
	const preferred = scene.navigationNodes.some((node) => node.id === 'paris-seat')
		? 'paris-seat'
		: scene.navigationNodes[0]?.id;
	return preferred ?? null;
}

export class EditorDocumentStore {
	/** Authoring document. The source of truth; everything else is derived. */
	document = $state<SceneDocument>(null!);

	/** Validator re-runs on every document change. */
	validation = $derived<SceneDocumentValidationResult>(
		validateSceneDocument(this.document)
	);

	/**
	 * Canonical JSON the store treats as "clean". Updated by
	 * `setBaseline(json)` after `resetToCheckedInDocument()` /
	 * `importDocument(...)`. `isDirty` compares against this; `canonicalJson`
	 * echoes it from the live document.
	 */
	baselineCanonicalJson = $state('');

	/**
	 * Resolved runtime scene. `$state.raw` (audit §8 "Do NOT" recommend-
	 * ation promotes to `$derived`): promote-causes a resolve storm,
	 * every dependent read would recompute the full topology. Recomputed
	 * lazily by `replace()`.
	 */
	scene = $state.raw<RuntimeScene>(null!);

	/**
	 * Visitor-FSM store clone. Same `$state.raw` discipline as `scene`.
	 * Recomputed lazily by `replace()` after the scene rebuild.
	 */
	state = $state.raw<RuntimeStateStore>(null!);

	/**
	 * Listeners invoked at the end of every successful `replace()`. The
	 * composition root registers `preview.refreshPausedDirector()`,
	 * `preview.pruneIfStale()`, and (in Slice 4) `selection.reconcile()`.
	 * Listeners fire in registration order; exceptions are caught and
	 * logged to console (Slice 4 will route errors through the listener
	 * signature once the session error channel stabilises).
	 */
	#afterReplaceListeners = new Set<AfterReplaceListener>();

	/**
	 * the room registry is a live seam, not a boot-time constant: the
	 * boot-empty editor swaps it whenever the project layout gains/loses rooms
	 * (see `EditorStore.updateRooms`). Every derived-runtime rebuild
	 * (`replace()`) reads the current registry, so scene content that
	 * references drafted rooms stays resolvable. The frozen relic never calls
	 * `updateRooms` — its Chopin registry is unchanged.
	 */
	rooms: LayoutRoomRegistry;

	constructor(
		initialDocument: SceneDocument,
		rooms: LayoutRoomRegistry
	) {
		const cloned = cloneSceneDocument(initialDocument);
		this.document = cloned;
		this.rooms = rooms;
		this.baselineCanonicalJson = serializeSceneDocument(cloned);
		this.#rebuildRuntime();
	}

	/**
	 * Swap the room registry after the project layout changed (room drafted,
	 * moved, or deleted) and immediately re-resolve the derived runtime. The
	 * scene document stores room-local coordinates, so any layout change that
	 * alters a referenced room's frame must re-run the world-space resolution
	 * (`resolveSceneDocument`) or the runtime scene keeps stale positions — the
	 * node/entity helpers would render where the room *was*. Resolution runs
	 * against the new registry *before* the reference swaps, so a dangling
	 * scene reference throws without leaving the store half-updated (the
	 * composition root decides how to surface the divergence).
	 */
	updateRooms(rooms: LayoutRoomRegistry) {
		this.#rebuildRuntime(rooms);
		this.rooms = rooms;
	}

	/**
	 * Replace the authoring document. Validation runs first; on success we
	 * rebuild `scene` + `state` and fire every registered `afterReplace`
	 * listener atomically. Used by `commitDocumentTransaction`,
	 * `undo/redo`, `importDocument`, and `resetToCheckedInDocument`.
	 */
	replace(next: SceneDocument) {
		this.document = cloneSceneDocument(next);
		this.#rebuildRuntime();
		this.#fireAfterReplace();
	}

	/**
	 * Canonical JSON of the live document. Useful as a plain-string setter
	 * for the export button + as the comparison operand for `isDirty`.
	 */
	get canonicalJson(): string {
		return serializeSceneDocument(this.document);
	}

	/**
	 * True when the live document differs from the baseline. P7.5 — adopted
	 * the facade pre-check (closes the divergence): an invalid document is
	 * "dirty" regardless of baseline comparison, because the user-facing
	 * save flow blocks on a validation failure but the dirty indicator must
	 * still flip. (`serializeSceneDocument` would throw on an invalid
	 * document, which is why the pre-check must short-circuit first.)
	 */
	get isDirty(): boolean {
		const v = this.validation;
		return !v.success || v.canonicalJson !== this.baselineCanonicalJson;
	}

	/** Validation issues for the live document (empty when valid). */
	get validationIssues() {
		const v = this.validation;
		return v.success ? [] : v.issues;
	}

	/**
	 * Reset the dirty baseline after a successful import / save. Called by
	 * the composition root's `importDocument()` and
	 * `resetToCheckedInDocument()` after `replace()`.
	 */
	setBaseline(json: string) {
		this.baselineCanonicalJson = json;
	}

	/**
	 * Equality helper for `commitDocumentTransaction`'s no-op detection
	 * (a transaction that doesn't actually mutate anything). Public
	 * static so `HistoryController` can use it without re-implementing
	 * the same JSON-stringify comparison.
	 */
	static documentsMatch(a: SceneDocument, b: SceneDocument): boolean {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	addAfterReplaceListener(listener: AfterReplaceListener): () => void {
		this.#afterReplaceListeners.add(listener);
		return () => this.#afterReplaceListeners.delete(listener);
	}

	#rebuildRuntime(rooms: LayoutRoomRegistry = this.rooms) {
		const nextScene = resolveSceneDocument(this.document, rooms);
		const initialNodeId = pickInitialNavigationNodeId(nextScene);
		const nextState = createRuntimeState(createNavigationGraph(nextScene), initialNodeId);
		// Re-assigning `$state.raw` outside an `untrack` wrap inside the
		// sub-store is safe; the watcher pipeline ignores `$state.raw`
		// reads. Match the pre-slice god-file (lines 4311–4312) — do not
		// untrack, that would drift from prior behaviour.
		this.scene = nextScene;
		this.state = nextState;
	}

	#fireAfterReplace() {
		for (const listener of [...this.#afterReplaceListeners]) {
			try {
				listener();
			} catch (error) {
				console.error('EditorDocumentStore listener threw', error);
			}
		}
	}
}
