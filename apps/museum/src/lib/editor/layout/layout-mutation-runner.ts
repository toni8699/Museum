import {
	captureLayoutPreviewSnapshot,
	type LayoutPreviewState
} from './layout-preview-state.svelte';

/**
 * The transaction surface of `MuseumEditorStore` the runner needs. Kept
 * structural so the runner never imports the store facade (and the frozen
 * relic can keep its own begin/commit/cancel wrappers if it must).
 */
export interface LayoutTransactionHost {
	beginLayoutTransaction(): boolean;
	commitLayoutTransaction(snapshot: unknown): boolean;
	cancelLayoutTransaction(): boolean;
}

/**
 * A begin/commit/cancel trio the runner drives. The store-backed factory
 * captures the preview snapshot for the commit; viewport gesture code passes
 * its already-snapshot-aware callbacks directly.
 */
export interface LayoutMutationRunner {
	begin(): boolean;
	commit(): boolean;
	cancel(): boolean;
}

export type LayoutMutationOutcome<T> =
	| { kind: 'skipped' }
	| { kind: 'committed'; result: T }
	| { kind: 'cancelled'; result: T };

/**
 * Run one standalone layout mutation as exactly one undo entry.
 *
 * `skipped` means no transaction could be opened (an enclosing gesture or a
 * blocked document already owns the undo boundary). The caller must treat the
 * mutation as NOT performed and surface its own "finish the current
 * interaction first" message. A successful mutation commits; a failed one
 * cancels so a rejected edit writes no history entry.
 */
export function runLayoutMutation<T>(
	runner: LayoutMutationRunner,
	mutate: () => T,
	didSucceed: (result: T) => boolean
): LayoutMutationOutcome<T> {
	if (!runner.begin()) return { kind: 'skipped' };
	const result = mutate();
	if (didSucceed(result)) {
		runner.commit();
		return { kind: 'committed', result };
	}
	runner.cancel();
	return { kind: 'cancelled', result };
}

/** Build a store-backed runner that snapshots the preview on commit. */
export function layoutMutationRunnerFor(
	host: LayoutTransactionHost,
	layoutPreview: LayoutPreviewState
): LayoutMutationRunner {
	return {
		begin: () => host.beginLayoutTransaction(),
		commit: () => host.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview)),
		cancel: () => host.cancelLayoutTransaction()
	};
}
