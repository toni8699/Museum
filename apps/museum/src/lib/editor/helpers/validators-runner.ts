/**
 * Validator helpers (audit §3.F, Slice 3 debt 3.12).
 *
 * `runOrFail` collapses the eight occurrences in `museum-editor.svelte.ts`
 * of the dance
 *
 * ```ts
 * const validation = validateX(...);
 * if (!validation.ok) {
 *   this.setStatusMessage(validation.message);
 *   return false;
 * }
 * const plan = validation; // used below
 * ```
 *
 * into
 *
 * ```ts
 * const sourceNode = runOrFail(this.session, () =>
 *   validateConnectionCreation(this.document, src, dest)
 * )?.sourceNode;
 * if (!sourceNode) return false; // status already posted
 * // OR: destructure entirely with the rest pattern
 * const { sourceNode, destinationNode } = runOrFail(this.session, () =>
 *   validateConnectionCreation(this.document, src, dest)
 * ) ?? {};
 * ```
 *
 * **Type-narrowing.** The generic `R` is constrained to the canonical
 * `{ok: boolean; message?: string}` shape TS sees on every validator return
 * (`Plan | EditorNavigationGraphFailure` etc.). After `result.ok` is true
 * the success variant's `ok` discriminant is stripped with
 * `Omit<Extract<R, {ok: true}>, 'ok'>` so destructuring or member access
 * never has to work around an `ok: true` field.
 *
 * **No Svelte runes here.** `session` is typed as
 * `Pick<EditorSessionState, 'setStatusMessage'>` so the helper depends on
 * no rune runtime; sub-stores and validators can call it.
 *
 * **No `as` cast on the failure path.** After `!result.ok`, the
 * `R extends { ok: boolean; message?: string }` constraint drops the
 * `ok: true` branch narrowing `result.message` to `string | undefined`,
 * which is then forwarded via the session channel.
 */

import type { EditorSessionState } from '../store/session-state.svelte';

/**
 * Canonical failure shape shared by every validator in
 * `editor-navigation-graph.ts`. Validators either succeed with `{ok: true}`
 * + their plan fields, or fail with `{ok: false; code; message}`.
 */
export interface EditorValidatorFailure {
	ok: false;
	code: string;
	message: string;
}

/** Anything `runOrFail` accepts as the `session` consumer of status messages. */
export type ValidatorSessionChannel = Pick<EditorSessionState, 'setStatusMessage'>;

/**
 * Run a validator. On success return the success variant with the
 * `{ok: true}` discriminant stripped. On failure post the message via the
 * session channel and return `null`.
 *
 * ```ts
 * const plan = runOrFail(
 *   this.session,
 *   () => validateConnectionCreation(this.document, src, dest)
 * );
 * if (!plan) return false;
 * const { sourceNode, destinationNode } = plan; // `ok` is gone
 * ```
 */
export function runOrFail<T extends { ok: boolean; message?: string }>(
	session: ValidatorSessionChannel,
	validator: () => T
): Extract<T, { ok: true }> | null {
	const result = validator();
	if (result.ok) {
		return result as Extract<T, { ok: true }>;
	}
	session.setStatusMessage(result.message ?? 'Validator rejected the request');
	return null;
}
