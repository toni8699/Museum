/**
 * `editor/store/binary-texture-store.svelte.ts` — Phase 5.4 singleton.
 *
 * **The only caller of `URL.createObjectURL` and `URL.revokeObjectURL`.**
 * Two integration helpers (`acquireObjectUrl` / `releaseObjectUrl`) and three
 * store methods (`objectUrlFor` / `clearExcept` / `releaseAllObjectUrls`)
 * collapse every Object-URL lifecycle into one place so:
 *
 *  - any code path that could orphan a URL is forced through one entry point,
 *  - `pendingObjectUrls` always reflects the live registry,
 *  - Mutation bumps `$state` Map/Set membership so `$derived` consumers in
 *    `project-export-store.svelte.ts` recompute on the next read.
 *
 * **Reactivity contract.** `map = $state(new Map(...))` makes `.has` / `.get`
 * / `.delete` / `.size` reactive. `pendingObjectUrls` is also `$state(new Set)`
 * so the same rule applies. Task 8's UI calls
 * `computeProjectExportBlocker(document, BinaryTextureStore)` inside
 * `$derived`; any `register` / `clearExcept` / `releaseAll` triggers a
 * recomputation without consumers needing a `version` counter dance.
 *
 * **No file-system or network IO.** Pure in-memory.
 *
 * **Visitor isolation.** Reached only from the editor entry; the `/museum`
 * visitor route does not import this module.
 */

import { sha256Bytes } from '@portfolio/project-model';

export type BinaryTextureMime = string;

export type BinaryTextureEntry = {
	bytes: Uint8Array;
	mime: BinaryTextureMime;
	fingerprint: string;
	objectUrl: string | null;
};

class BinaryTextureStoreImpl {
	// Reactive Map. Reads of `.has` / `.size` / `.entries` track; writes
	// (`.set` / `.delete`) trigger recomputation in any `$derived` that
	// read the same key.
	#map = $state(new Map<string, BinaryTextureEntry>());

	// Live registry of every Object URL we've created. Used by the
	// MuseumEditorApp's unload sweep to revoke orphans.
	pendingObjectUrls = $state(new Set<string>());

	/**
	 * Register bytes against a uri. Re-registering the same uri overwrites
	 * — if the previous entry held an Object URL we revoke it (leak-free).
	 *
	 * Returns the canonical `sha256-<64 hex>` fingerprint clients persist
	 * into the exported manifest.
	 */
	async register(
		uri: string,
		bytes: Uint8Array,
		mime: BinaryTextureMime
	): Promise<{ fingerprint: string }> {
		const fingerprint = await sha256Bytes(bytes);
		const existing = this.#map.get(uri);
		if (existing?.objectUrl) {
			URL.revokeObjectURL(existing.objectUrl);
			this.pendingObjectUrls.delete(existing.objectUrl);
		}
		this.#map.set(uri, { bytes, mime, fingerprint, objectUrl: null });
		return { fingerprint };
	}

	/** Whether bytes are registered for `uri`. Reactive. */
	has(uri: string): boolean {
		return this.#map.has(uri);
	}

	/** Return registered bytes or throw. Returns a stable reference. */
	async resolve(uri: string): Promise<Uint8Array> {
		const entry = this.#map.get(uri);
		if (!entry) {
			throw new Error(`No binary texture registered for ${uri}`);
		}
		return entry.bytes;
	}

	/** Diagnostic accessor; returns null if no entry exists. */
	getEntry(uri: string): BinaryTextureEntry | null {
		return this.#map.get(uri) ?? null;
	}

	/**
	 * Lazily create + cache an Object URL for `uri`. First call creates +
	 * registers on `pendingObjectUrls`; subsequent calls return the same
	 * URL until releaseAll / clearExcept drops it.
	 */
	objectUrlFor(uri: string): string | null {
		const entry = this.#map.get(uri);
		if (!entry) return null;
		if (!entry.objectUrl) {
			// Reuse the public `acquireObjectUrl` so there's one Blob-wrap
			// + `URL.createObjectURL` site. Helper also auto-registers on
			// `pendingObjectUrls`.
			entry.objectUrl = acquireObjectUrl(entry.bytes, entry.mime);
		}
		return entry.objectUrl;
	}

	/**
	 * Drop every entry whose uri is NOT in `retainUris`. Any cached Object
	 * URL on a pruned entry is revoked and removed from the registry.
	 */
	clearExcept(retainUris: ReadonlySet<string>): void {
		for (const [uri, entry] of Array.from(this.#map.entries())) {
			if (retainUris.has(uri)) continue;
			if (entry.objectUrl) {
				URL.revokeObjectURL(entry.objectUrl);
				this.pendingObjectUrls.delete(entry.objectUrl);
			}
			this.#map.delete(uri);
		}
	}

	/**
	 * Revoke every tracked Object URL — both per-entry URLs and any that
	 * were acquired through `acquireObjectUrl` but never promoted into an
	 * entry (the project's `<a download>`-after-export case lands here).
	 *
	 * Entries remain registered so callers can re-acquire without
	 * re-uploading the bytes.
	 */
	releaseAllObjectUrls(): void {
		for (const entry of this.#map.values()) {
			if (entry.objectUrl) {
				URL.revokeObjectURL(entry.objectUrl);
				this.pendingObjectUrls.delete(entry.objectUrl);
				entry.objectUrl = null;
			}
		}
		for (const url of Array.from(this.pendingObjectUrls)) {
			URL.revokeObjectURL(url);
			this.pendingObjectUrls.delete(url);
		}
	}

	/** Snapshot of all registered uris (insertion order). */
	peekAllUris(): ReadonlyArray<string> {
		return Array.from(this.#map.keys());
	}

	/**
	 * TEST-ONLY: drop every entry, revoke every URL, clear the registry.
	 * Production never calls this.
	 */
	__resetForTests(): void {
		this.releaseAllObjectUrls();
		this.clearExcept(new Set());
	}
}

/**
 * Module-level singleton. The `/museum` visitor route never imports this file;
 * only the editor entry reaches it.
 */
export const BinaryTextureStore = new BinaryTextureStoreImpl();

/**
 * Acquire an Object URL for ad-hoc bytes (e.g. the package export's
 * temporary `<a download>` blob). Registered on `pendingObjectUrls` so the
 * unload sweep picks it up. **Sole Blob+`URL.createObjectURL` site in the
 * codebase** — every production path that needs an object URL goes here so
 * `URL.revokeObjectURL` always has a matching `URL.createObjectURL`.
 */
export function acquireObjectUrl(bytes: Uint8Array, mime: BinaryTextureMime): string {
	// `bytes.slice()` upgrades to `Uint8Array<ArrayBuffer>` so the Blob
	// constructor accepts the typed array under TS 5.8. Runtime is identical.
	const blob = new Blob([bytes.slice()], { type: mime });
	const url = URL.createObjectURL(blob);
	BinaryTextureStore.pendingObjectUrls.add(url);
	return url;
}

/**
 * Release a tracked URL: revokes it AND removes it from `pendingObjectUrls`.
 * **No-op for untracked URLs** — caller error if passed a URL that wasn't
 * acquired through `acquireObjectUrl` / `objectUrlFor`. The conservative
 * path prevents accidental side-effects on URLs owned by other stores.
 */
export function releaseObjectUrl(url: string): void {
	if (!BinaryTextureStore.pendingObjectUrls.has(url)) return;
	URL.revokeObjectURL(url);
	BinaryTextureStore.pendingObjectUrls.delete(url);
}

/** Module-level convenience for the App-level unload sweep. */
export function releaseAllObjectUrls(): void {
	BinaryTextureStore.releaseAllObjectUrls();
}

/** TEST-ONLY: forward to the singleton's reset hook. */
export function __resetBinaryTextureStoreForTests(): void {
	BinaryTextureStore.__resetForTests();
}
