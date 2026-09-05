/**
 * `ProjectAssetRequestScope` — session ownership for project-asset requests.
 *
 * One instance lives in the project session owner (currently `EditorApp`,
 * mounted once per projectId inside the keyed project layout). It owns the
 * epoch + token + controller dance that keeps in-flight registry work bound
 * to its session:
 *
 * - every list/mutation/export request is captured with its token/epoch, and
 *   late responses are disowned by comparing against the live counters;
 * - session teardown (`invalidate`, called on unmount and on project-context
 *   switches) bumps the epoch/tokens and aborts every in-flight controller,
 *   so a late A-response can never commit into B's session after an A→B
 *   navigation.
 *
 * Plain fields, deliberately not runes: no reactive reader observes these
 * counters today (predicates read them inside effects and async continuations,
 * exactly as before the extraction).
 */
export type AssetRequestSnapshot = {
	token: number;
	epoch: number;
	controller: AbortController;
};

export class ProjectAssetRequestScope {
	private epochValue = 0;
	private listTokenValue = 0;
	private mutationTokenValue = 0;
	private listControllerValue: AbortController | null = null;
	private mutationControllerValue: AbortController | null = null;
	private readonly exportControllers = new Set<AbortController>();

	get epoch(): number {
		return this.epochValue;
	}

	get listToken(): number {
		return this.listTokenValue;
	}

	get mutationToken(): number {
		return this.mutationTokenValue;
	}

	get listController(): AbortController | null {
		return this.listControllerValue;
	}

	get mutationController(): AbortController | null {
		return this.mutationControllerValue;
	}

	/** Start a registry list fetch, superseding any in-flight list. */
	beginList(): AssetRequestSnapshot {
		this.listControllerValue?.abort();
		const controller = new AbortController();
		this.listControllerValue = controller;
		this.listTokenValue += 1;
		return { token: this.listTokenValue, epoch: this.epochValue, controller };
	}

	/** Release the list controller on completion, iff the token is still current. */
	releaseListController(token: number): void {
		if (token === this.listTokenValue) this.listControllerValue = null;
	}

	/** Start a registry mutation (upload/retry/convert/accept), superseding any in-flight mutation. */
	beginMutation(): AssetRequestSnapshot {
		this.mutationControllerValue?.abort();
		const controller = new AbortController();
		this.mutationControllerValue = controller;
		this.mutationTokenValue += 1;
		return { token: this.mutationTokenValue, epoch: this.epochValue, controller };
	}

	/**
	 * Release the mutation controller on completion. Returns whether the
	 * token is still current (the caller clears its in-flight flag only then).
	 */
	releaseMutationController(token: number): boolean {
		if (token !== this.mutationTokenValue) return false;
		this.mutationControllerValue = null;
		return true;
	}

	/** Track a byte-export fetch so teardown aborts it. */
	trackExport(controller: AbortController): void {
		this.exportControllers.add(controller);
	}

	/** Untrack a settled byte-export fetch. */
	untrackExport(controller: AbortController): void {
		this.exportControllers.delete(controller);
	}

	get exportCount(): number {
		return this.exportControllers.size;
	}

	/**
	 * Session teardown (unmount / project-context switch): bump the
	 * epoch/tokens and abort every in-flight list, mutation, and export
	 * controller. In-flight work disowns itself through the live counters and
	 * the aborted signals.
	 */
	invalidate(): void {
		this.epochValue += 1;
		this.listTokenValue += 1;
		this.mutationTokenValue += 1;
		this.listControllerValue?.abort();
		this.mutationControllerValue?.abort();
		for (const controller of this.exportControllers) controller.abort();
		this.exportControllers.clear();
		this.listControllerValue = null;
		this.mutationControllerValue = null;
	}
}
