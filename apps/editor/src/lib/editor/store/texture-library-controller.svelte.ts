/**
 * `EditorTextureLibraryController` — Phase 5.2 texture + material-instance
 * orchestration.
 *
 * Slice 3 of the Priority-1 file-split refactor lifts the facade's texture
 * library orchestration (≈ 160 LOC, lines ~2195–2358) out of
 * `editor-store.svelte.ts`:
 *
 * - `registerTexture` — async; verifies URI safety, dedupes exact-URI
 *   hits, awaits the verifier, re-checks the document after the await,
 *   then commits through `materialResourceMutator.registerVerifiedTexture`.
 * - `probeTexture` — non-mutating image load probe; caches the result in
 *   `session.textureLoadStates`.
 * - `requestMaterialEdit` — inspector-driven patch entry; routes
 *   decision-pending results into `session.pendingMaterialEdit`.
 * - `requestTextureAssignment` — viewport drop entry; on commit, selects
 *   the target entity and marks the texture recently used.
 * - `confirmPendingMaterialEdit` — replay a queued pending edit against
 *   current state; falls through with refreshed requirements on stale
 *   decision-required.
 * - `cancelPendingMaterialEdit` — clear the queued decision without
 *   touching the document.
 * - `makeMaterialInstanceUnique` — one-line delegate to
 *   `materialResourceMutator.makeMaterialInstanceUnique`.
 *
 * The pure mutator (`store/material-resource-mutator.svelte.ts`) stays
 * where it is — this controller wraps its three public methods with the
 * verification, dedup, re-race, selection-update, and session-cache glue.
 *
 * `recentTextureIds` / `textureLoadStates` / `pendingMaterialEdit`
 * getters stay on the facade (they're the public session surface); the
 * host cast binds the controller to `session.*` for writes only this
 * orchestration owns.
 *
 * `textureVerifier` ownership moves from the facade to this controller
 * (the constructor receives both `host` + the verifier so the
 * `EditorStore` constructor's `options.textureVerifier ??
 * createTextureVerifier()` defaulting stays intact).
 */

import { isSafeTextureUri } from '$lib/content/texture-uri';
import type { SceneDocument } from '$lib/content/scene';
import type {
	MaterialEditDecision,
	MaterialInstancePatch
} from '../editor-types';
import type { TextureVerifier } from '../texture-verifier';
import type { EditorSelectionActions } from './selection-actions.svelte';
import type { EditorSessionState } from './session-state.svelte';
import type { EditorMaterialResourceMutator } from './material-resource-mutator.svelte';
import { BinaryTextureStore } from './binary-texture-store.svelte';
import { extensionForMime, isSupportedMime } from '@portfolio/project-model';

/**
 * Composition-root surface `EditorTextureLibraryController` depends on.
 * Everything here is owned by `EditorStore`; the controller never
 * mutates the document store, history controller, or material-resource
 * mutator directly — only through the accessors / methods below.
 */
export interface EditorTextureLibraryControllerHost {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;

	// Document + selection + the pure material-resource mutator + the
	// session-only state the orchestration reads / writes.
	readonly document: SceneDocument;
	readonly selectionActions: EditorSelectionActions;
	readonly materialResourceMutator: EditorMaterialResourceMutator;
	readonly session: EditorSessionState;

	// Facade status channel.
	setStatusMessage(message: string | null): void;
}

export class EditorTextureLibraryController {
	constructor(
		private readonly host: EditorTextureLibraryControllerHost,
		private readonly textureVerifier: TextureVerifier
	) {}

	/**
	 * Register a verified public texture URI. Exact trimmed-URI duplicates
	 * reuse the existing texture with no history. Verification happens
	 * before any document transaction begins.
	 */
	async registerTexture(name: string, uri: string): Promise<string | null> {
		const host = this.host;
		const trimmedName = name.trim();
		const trimmedUri = uri.trim();
		if (!trimmedUri || !isSafeTextureUri(trimmedUri)) {
			host.setStatusMessage('Texture URI must be a safe root-relative public path');
			return null;
		}
		// Reuse an existing exact URI before verification (no history).
		const existing = host.document.textures.find((texture) => texture.uri === trimmedUri);
		if (existing) {
			host.session.markTextureRecentlyUsed(existing.id);
			return existing.id;
		}
		const verification = await this.textureVerifier(trimmedUri);
		if (verification.status !== 'ready') {
			host.setStatusMessage(verification.message);
			return null;
		}
		// Recheck current state — Reset/Import/Undo/another registration may
		// have replaced the document while the image loaded.
		const raced = host.document.textures.find((texture) => texture.uri === trimmedUri);
		if (raced) {
			host.session.markTextureRecentlyUsed(raced.id);
			return raced.id;
		}
		const result = host.materialResourceMutator.registerVerifiedTexture(
			trimmedName,
			trimmedUri
		);
		if (result.status === 'rejected') {
			host.setStatusMessage(result.reason);
			return null;
		}
		return result.textureId;
	}

	/**
	 * Register a local-file texture (Phase 5.4). The bytes never enter the
	 * canonical JSON; the URI `/local/<randomId>/<stem>.<ext>` is purely
	 * session-local and gets bundled by the package exporter on save. The
	 * binary store is primed BEFORE the document mutation so concurrent
	 * material renders can't fetch the URI before bytes are available.
	 *
	 * Returns the new texture id on success, or `null` (with a status
	 * message) on reject. Re-uploading identical bytes gets a fresh URI
	 * and a fresh texture asset — concept-of-decoupled-resources.
	 */
	async registerLocalFileTexture(
		name: string,
		bytes: Uint8Array,
		mime: string
	): Promise<string | null> {
		const host = this.host;
		const trimmedName = name.trim();
		if (!trimmedName) {
			host.setStatusMessage('Texture name is required');
			return null;
		}
		if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
			host.setStatusMessage('Texture bytes must be a non-empty buffer');
			return null;
		}
		if (!isSupportedMime(mime)) {
			host.setStatusMessage(`Unsupported MIME type: ${mime}`);
			return null;
		}
		const ext = extensionForMime(mime);
		const stem = trimmedName
			.replace(/[^a-z0-9._-]+/gi, '-')
			.replace(/^-+|-+$/g, '')
			.toLowerCase() || 'texture';
		const randomId = createLocalRandomId();
		const uri = `/local/${randomId}/${stem}${ext}`;

		await BinaryTextureStore.register(uri, bytes, mime);
		const result = host.materialResourceMutator.registerVerifiedTexture(trimmedName, uri);
		if (result.status === 'rejected') {
			host.setStatusMessage(result.reason);
			return null;
		}
		return result.textureId;
	}

	/**
	 * Probe one texture's image load state without mutating the document.
	 * Updates the session-only load-state map and returns load success.
	 */
	async probeTexture(textureId: string): Promise<boolean> {
		const host = this.host;
		const texture = host.document.textures.find((candidate) => candidate.id === textureId);
		if (!texture) return false;
		const current = host.session.textureLoadStates[texture.uri];
		if (current?.status === 'ready') return true;
		if (current?.status === 'loading') return false;
		host.session.setTextureLoadState(texture.uri, { status: 'loading' });
		const verification = await this.textureVerifier(texture.uri);
		if (verification.status === 'ready') {
			host.session.setTextureLoadState(texture.uri, { status: 'ready' });
			return true;
		}
		host.session.setTextureLoadState(texture.uri, {
			status: 'error',
			message: verification.message
		});
		return false;
	}

	/**
	 * Inspector entry — applies one field patch or queues the decision the
	 * Material inspector needs. Returns true when committed or queued.
	 */
	requestMaterialEdit(entityId: string, patch: MaterialInstancePatch): boolean {
		const host = this.host;
		const result = host.materialResourceMutator.applyMaterialPatch(entityId, patch);
		if (result.status === 'committed') return true;
		if (result.status === 'decision-required') {
			host.session.setPendingMaterialEdit({
				entityId,
				needsBaseMaterial: result.needsBaseMaterial,
				sharedMaterialInstanceId: result.sharedMaterialInstanceId,
				patch: { ...patch },
				recentTextureId: typeof patch.baseTextureId === 'string' ? patch.baseTextureId : null
			});
			return true;
		}
		host.setStatusMessage(result.reason);
		return false;
	}

	/**
	 * Viewport drop entry — assigns one registered texture to a model or
	 * primitive, queueing the base-material / shared-instance decision when
	 * required. Successful commits select the target entity.
	 */
	requestTextureAssignment(entityId: string, textureId: string): boolean {
		const host = this.host;
		const result = host.materialResourceMutator.applyMaterialPatch(
			entityId,
			{ baseTextureId: textureId },
			{},
			'texture-assignment'
		);
		if (result.status === 'committed') {
			host.selectionActions.selectPlacement(entityId);
			host.session.markTextureRecentlyUsed(textureId);
			return true;
		}
		if (result.status === 'decision-required') {
			host.session.setPendingMaterialEdit({
				entityId,
				needsBaseMaterial: result.needsBaseMaterial,
				sharedMaterialInstanceId: result.sharedMaterialInstanceId,
				patch: { baseTextureId: textureId },
				recentTextureId: textureId
			});
			return true;
		}
		host.setStatusMessage(result.reason);
		return false;
	}

	/**
	 * Replays a queued pending material edit against current state. Clears
	 * the request only after commit or definitive rejection; a stale
	 * re-queued decision stays open with refreshed requirements.
	 */
	confirmPendingMaterialEdit(decision: MaterialEditDecision): boolean {
		const host = this.host;
		const pending = host.session.pendingMaterialEdit;
		if (!pending) return false;
		const source =
			pending.recentTextureId !== null ? 'texture-assignment' : 'inspector';
		const result = host.materialResourceMutator.applyMaterialPatch(
			pending.entityId,
			pending.patch,
			decision,
			source
		);
		if (result.status === 'committed') {
			host.session.setPendingMaterialEdit(null);
			if (source === 'texture-assignment') {
				host.selectionActions.selectPlacement(pending.entityId);
				if (pending.recentTextureId) {
					host.session.markTextureRecentlyUsed(pending.recentTextureId);
				}
			}
			return true;
		}
		if (result.status === 'decision-required') {
			host.session.setPendingMaterialEdit({
				...pending,
				needsBaseMaterial: result.needsBaseMaterial,
				sharedMaterialInstanceId: result.sharedMaterialInstanceId
			});
			return true;
		}
		host.session.setPendingMaterialEdit(null);
		host.setStatusMessage(result.reason);
		return false;
	}

	/** Cancel a queued material decision without mutating the document. */
	cancelPendingMaterialEdit(): boolean {
		const host = this.host;
		if (!host.session.pendingMaterialEdit) return false;
		host.session.setPendingMaterialEdit(null);
		return true;
	}

	/** Clone a shared material instance and repoint one entity (one history entry). */
	makeMaterialInstanceUnique(entityId: string): boolean {
		return this.host.materialResourceMutator.makeMaterialInstanceUnique(entityId);
	}
}

/** Short, URL-safe, hex-only id used for local-file texture URIs. */
function createLocalRandomId(): string {
	if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
		const bytes = new Uint8Array(6);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	}
	return Math.random().toString(36).slice(2, 14);
}
