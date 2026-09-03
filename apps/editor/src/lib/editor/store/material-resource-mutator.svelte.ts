/**
 * `EditorMaterialResourceMutator` — Phase 5.2 texture + material-resource mutator.
 *
 * Hosts the canonical editor mutation path for:
 *
 * - texture registration (idempotent on exact trimmed URI);
 * - assignment of registered textures to model / primitive entities;
 * - base-material / roughness / metalness edits;
 * - Make-unique cloning for shared material instances.
 *
 * The mutator never reads or writes selection / history / runtime directly. It
 * resolves current state, validates the patch, then performs one document
 * transaction. Lights and non-renderable scene objects are rejected.
 *
 * `applyMaterialPatch` re-resolves entity / texture / current instance / usage
 * count on every call so an async race with Reset / Import / Undo / another
 * registration never overwrites newer state. Decisions supplied directly via
 * `MaterialEditDecision` skip the dialog; missing decisions surface as
 * `decision-required` so the facade can queue them in
 * `session.pendingMaterialEdit`.
 */

import { isMaterialId } from '$lib/content/materials';
import type {
	SceneDocument,
	SceneEntity,
	SceneMaterialInstance,
	SceneModelEntity,
	ScenePrimitiveEntity,
	SceneTextureAsset
} from '$lib/content/scene';
import type { MaterialId } from '$lib/types/materials';
import { isSafeTextureUri } from '$lib/content/texture-uri';
import {
	materialInstanceUsageCount,
	reserveResourceId,
	resourceIdBase,
	type MaterialEditDecision,
	type MaterialInstancePatch,
	type MaterialShareMode
} from '../editor-textures';

export interface EditorMaterialResourceMutatorHost {
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	readonly document: SceneDocument;
	setStatusMessage(message: string | null): void;
	beginDocumentTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;
	markTextureRecentlyUsed(textureId: string): void;
}

export type RegisterTextureResult =
	| { status: 'created'; textureId: string }
	| { status: 'existing'; textureId: string }
	| { status: 'rejected'; reason: string };

export type ApplyMaterialPatchSource = 'inspector' | 'texture-assignment';

export type MaterialEditResult =
	| { status: 'committed'; entityId: string; materialInstanceId: string; textureId: string | null }
	| {
			status: 'decision-required';
			needsBaseMaterial: boolean;
			sharedMaterialInstanceId: string | null;
	  }
	| { status: 'rejected'; reason: string };

interface ResolvedPatch {
	name: string;
	baseMaterialId: MaterialId;
	baseTextureId?: string | null;
	roughness?: number | null;
	metalness?: number | null;
}

export class EditorMaterialResourceMutator {
	constructor(private readonly host: EditorMaterialResourceMutatorHost) {}

	// =================================================================
	// Texture registration
	// =================================================================

	registerVerifiedTexture(name: string, uri: string): RegisterTextureResult {
		if (this.host.isDocumentMutationBlocked) {
			return { status: 'rejected', reason: 'Editor currently blocks document mutations' };
		}
		if (this.host.isEditorInteractionActive) {
			return { status: 'rejected', reason: 'Finish the in-flight interaction first' };
		}
		const trimmedName = name.trim();
		const trimmedUri = uri.trim();
		if (!trimmedUri) return { status: 'rejected', reason: 'Texture URI is required' };
		const incomingName = trimmedName || deriveTextureName(trimmedUri);
		if (!isSafeTextureUri(trimmedUri)) {
			return { status: 'rejected', reason: `Unsafe texture URI: ${trimmedUri}` };
		}

		const documents = this.host.document;
		const existing = documents.textures.find((texture) => texture.uri === trimmedUri);
		if (existing) {
			this.host.markTextureRecentlyUsed(existing.id);
			return { status: 'existing', textureId: existing.id };
		}

		const filename = trimmedUri.split('/').pop() ?? '';
		const baseFallback = filename.replace(/\.[^.]+$/, '') || 'texture';
		const idBase = resourceIdBase(incomingName, baseFallback) || 'texture';
		const reservedIds = new Set(documents.textures.map(({ id }) => id));
		const textureId = reserveResourceId(idBase, reservedIds);

		const asset: SceneTextureAsset = {
			id: textureId,
			name: incomingName,
			uri: trimmedUri
		};

		if (!this.host.beginDocumentTransaction()) {
			return { status: 'rejected', reason: 'Could not begin a document transaction' };
		}
		documents.textures.push(asset);
		const committed = this.host.commitDocumentTransaction();
		if (!committed) {
			this.host.cancelDocumentTransaction();
			return { status: 'rejected', reason: 'Document history rejected the registration' };
		}
		this.host.markTextureRecentlyUsed(textureId);
		return { status: 'created', textureId };
	}

	replaceTextureUri(textureId: string, expectedUri: string, nextUri: string): boolean {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const texture = this.host.document.textures.find((candidate) => candidate.id === textureId);
		if (!texture || texture.uri !== expectedUri || texture.uri === nextUri || !isSafeTextureUri(nextUri)) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		texture.uri = nextUri;
		if (!this.host.commitDocumentTransaction()) {
			this.host.cancelDocumentTransaction();
			return false;
		}
		return true;
	}

	// =================================================================
	// Material instance patch
	// =================================================================

	applyMaterialPatch(
		entityId: string,
		patch: MaterialInstancePatch,
		decision: MaterialEditDecision = {},
		source: ApplyMaterialPatchSource = 'inspector'
	): MaterialEditResult {
		if (this.host.isDocumentMutationBlocked) {
			return { status: 'rejected', reason: 'Editor currently blocks document mutations' };
		}
		if (this.host.isEditorInteractionActive) {
			return { status: 'rejected', reason: 'Finish the in-flight interaction first' };
		}

		const entity = this.host.document.entities.find((candidate) => candidate.id === entityId);
		if (!entity) {
			return { status: 'rejected', reason: `Unknown scene entity: ${entityId}` };
		}
		if (entity.kind !== 'model' && entity.kind !== 'primitive') {
			return { status: 'rejected', reason: 'Lights cannot accept material assignments' };
		}

		const resolved = this.resolveAndValidatePatch(entity, patch, decision);
		if ('rejected' in resolved) return { status: 'rejected', reason: resolved.rejected };

		const currentInstance = this.findCurrentInstance(entity);
		const usage = currentInstance
			? materialInstanceUsageCount(this.host.document, currentInstance.id)
			: 0;

		// First assignment path: resolve base material; queue if model.
		if (!currentInstance) {
			if (resolved.requiresBaseDecision) {
				return {
					status: 'decision-required',
					needsBaseMaterial: true,
					sharedMaterialInstanceId: null
				};
			}
			return this.#commitFirstAssignment(entity, resolved.value as ResolvedPatch, source);
		}

		// Shared instance path.
		if (usage > 1) {
			const shareMode = resolved.shareMode ?? decision.shareMode ?? null;
			if (shareMode === null) {
				return {
					status: 'decision-required',
					needsBaseMaterial: false,
					sharedMaterialInstanceId: currentInstance.id
				};
			}
			if (shareMode === 'edit-shared') {
				return this.#commitInPlaceEdit(currentInstance, resolved.value as ResolvedPatch);
			}
			return this.#commitMakeUnique(
				entity,
				currentInstance,
				resolved.value as ResolvedPatch,
				source
			);
		}

		// Unshared existing instance.
		return this.#commitInPlaceEdit(currentInstance, resolved.value as ResolvedPatch);
	}

	makeMaterialInstanceUnique(entityId: string): boolean {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const entity = this.host.document.entities.find((candidate) => candidate.id === entityId);
		if (!entity || (entity.kind !== 'model' && entity.kind !== 'primitive')) return false;
		const current = this.findCurrentInstance(entity);
		if (!current) return false;
		const usage = materialInstanceUsageCount(this.host.document, current.id);
		if (usage <= 1) return false;
		const patch: ResolvedPatch = {
			name: `${entity.name} Material`,
			baseMaterialId: current.baseMaterialId
		};
		const committed = this.#commitMakeUnique(entity, current, patch, 'inspector');
		return committed.status === 'committed';
	}

	// =================================================================
	// Internals
	// =================================================================

	#commitFirstAssignment(
		entity: SceneModelEntity | ScenePrimitiveEntity,
		patch: ResolvedPatch,
		source: ApplyMaterialPatchSource
	): MaterialEditResult {
		const reservedIds = new Set(this.host.document.materials.map(({ id }) => id));
		const id = reserveResourceId(`${entity.id}-material`, reservedIds);
		const instance: SceneMaterialInstance = {
			id,
			name: `${entity.name} Material`,
			baseMaterialId: patch.baseMaterialId,
			...(patch.baseTextureId === null
				? {}
				: patch.baseTextureId === undefined
					? {}
					: { baseTextureId: patch.baseTextureId }),
			...(patch.roughness === null
				? {}
				: patch.roughness === undefined
					? {}
					: { roughness: patch.roughness }),
			...(patch.metalness === null
				? {}
				: patch.metalness === undefined
					? {}
					: { metalness: patch.metalness })
		};

		if (!this.host.beginDocumentTransaction()) {
			return { status: 'rejected', reason: 'Could not begin a document transaction' };
		}
		this.host.document.materials.push(instance);
		entity.materialInstanceId = id;
		const committed = this.host.commitDocumentTransaction();
		if (!committed) {
			this.host.cancelDocumentTransaction();
			return { status: 'rejected', reason: 'Document history rejected the change' };
		}
		if (source === 'texture-assignment' && patch.baseTextureId) {
			this.host.markTextureRecentlyUsed(patch.baseTextureId);
		}
		return { status: 'committed', entityId: entity.id, materialInstanceId: id, textureId: patch.baseTextureId ?? null };
	}

	#commitInPlaceEdit(
		instance: SceneMaterialInstance,
		patch: ResolvedPatch
	): MaterialEditResult {
		const candidate: SceneMaterialInstance = {
			id: instance.id,
			name: instance.name,
			baseMaterialId: patch.baseMaterialId,
			...(patch.baseTextureId === null
				? {}
				: patch.baseTextureId === undefined
					? instance.baseTextureId === undefined
						? {}
						: { baseTextureId: instance.baseTextureId }
					: { baseTextureId: patch.baseTextureId }),
			...(patch.roughness === null
				? {}
				: patch.roughness === undefined
					? instance.roughness === undefined
						? {}
						: { roughness: instance.roughness }
					: { roughness: patch.roughness }),
			...(patch.metalness === null
				? {}
				: patch.metalness === undefined
					? instance.metalness === undefined
						? {}
						: { metalness: instance.metalness }
					: { metalness: patch.metalness })
		};

		if (this.#materialInstanceEquals(instance, candidate)) {
			return { status: 'rejected', reason: 'No material changes to commit' };
		}

		if (!this.host.beginDocumentTransaction()) {
			return { status: 'rejected', reason: 'Could not begin a document transaction' };
		}
		this.writeMaterialInstance(instance, candidate);
		const committed = this.host.commitDocumentTransaction();
		if (!committed) {
			this.host.cancelDocumentTransaction();
			return { status: 'rejected', reason: 'Document history rejected the change' };
		}
		return {
			status: 'committed',
			entityId: ownerEntityId(this.host.document, instance.id) ?? '',
			materialInstanceId: instance.id,
			textureId: candidate.baseTextureId ?? null
		};
	}

	#commitMakeUnique(
		entity: SceneModelEntity | ScenePrimitiveEntity,
		source: SceneMaterialInstance,
		patch: ResolvedPatch,
		src: ApplyMaterialPatchSource
	): MaterialEditResult {
		const reservedIds = new Set(this.host.document.materials.map(({ id }) => id));
		const cloneId = reserveResourceId(`${source.id}-copy`, reservedIds);
		const clone: SceneMaterialInstance = {
			id: cloneId,
			name: `${source.name} Copy`,
			baseMaterialId: patch.baseMaterialId,
			...(patch.baseTextureId === null
				? {}
				: patch.baseTextureId === undefined
					? source.baseTextureId === undefined
						? {}
						: { baseTextureId: source.baseTextureId }
					: { baseTextureId: patch.baseTextureId }),
			...(patch.roughness === null
				? {}
				: patch.roughness === undefined
					? source.roughness === undefined
						? {}
						: { roughness: source.roughness }
					: { roughness: patch.roughness }),
			...(patch.metalness === null
				? {}
				: patch.metalness === undefined
					? source.metalness === undefined
						? {}
						: { metalness: source.metalness }
					: { metalness: patch.metalness })
		};

		if (!this.host.beginDocumentTransaction()) {
			return { status: 'rejected', reason: 'Could not begin a document transaction' };
		}
		this.host.document.materials.push(clone);
		entity.materialInstanceId = cloneId;
		const committed = this.host.commitDocumentTransaction();
		if (!committed) {
			this.host.cancelDocumentTransaction();
			return { status: 'rejected', reason: 'Document history rejected the change' };
		}
		if (src === 'texture-assignment' && patch.baseTextureId) {
			this.host.markTextureRecentlyUsed(patch.baseTextureId);
		}
		return {
			status: 'committed',
			entityId: entity.id,
			materialInstanceId: cloneId,
			textureId: clone.baseTextureId ?? null
		};
	}

	resolveAndValidatePatch(
		entity: SceneModelEntity | ScenePrimitiveEntity,
		patch: MaterialInstancePatch,
		decision: MaterialEditDecision
	):
		| { value: ResolvedPatch; requiresBaseDecision: false; shareMode: MaterialShareMode | null }
		| { rejected: string }
		| { value: null; requiresBaseDecision: true; shareMode: MaterialShareMode | null } {
		// Validate texture references.
		if (typeof patch.baseTextureId === 'string') {
			if (
				!this.host.document.textures.some(
					(texture) => texture.id === patch.baseTextureId
				)
			) {
				return { rejected: `Unknown texture id: ${patch.baseTextureId}` };
			}
		}
		// Validate base material references.
		if (patch.baseMaterialId !== undefined && !isMaterialId(patch.baseMaterialId)) {
			return { rejected: `Unknown catalogue material: ${patch.baseMaterialId}` };
		}
		if (decision.baseMaterialId !== undefined && !isMaterialId(decision.baseMaterialId)) {
			return { rejected: `Unknown catalogue material: ${decision.baseMaterialId}` };
		}
		// Validate roughness / metalness range.
		const rangeCheck = (field: 'roughness' | 'metalness'): number | null | undefined => {
			const value = patch[field];
			if (value === undefined) return undefined;
			if (value === null) return null;
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
				throw new Error(`${field} must be a finite number in [0, 1]`);
			}
			return value;
		};
		let roughness: number | null | undefined;
		let metalness: number | null | undefined;
		try {
			roughness = rangeCheck('roughness');
			metalness = rangeCheck('metalness');
		} catch (error) {
			return { rejected: error instanceof Error ? error.message : 'Invalid override' };
		}

		const currentInstance = this.findCurrentInstance(entity);
		const shareMode: MaterialShareMode | null =
			currentInstance && materialInstanceUsageCount(this.host.document, currentInstance.id) > 1
				? decision.shareMode ?? null
				: null;

		// Resolve target base material.
		if (currentInstance) {
			const currentBase = currentInstance.baseMaterialId;
			const requestedBase =
				patch.baseMaterialId !== undefined
					? patch.baseMaterialId
					: decision.baseMaterialId ?? currentBase;
			return {
				value: {
					name: currentInstance.name,
					baseMaterialId: requestedBase,
					baseTextureId: patch.baseTextureId,
					roughness,
					metalness
				},
				requiresBaseDecision: false,
				shareMode
			};
		}

		// First assignment.
		const fallbackBase = entity.kind === 'primitive' ? entity.materialId : null;
		if (fallbackBase !== null) {
			return {
				value: {
					name: `${entity.name} Material`,
					baseMaterialId: patch.baseMaterialId ?? decision.baseMaterialId ?? fallbackBase,
					baseTextureId: patch.baseTextureId,
					roughness,
					metalness
				},
				requiresBaseDecision: false,
				shareMode: null
			};
		}
		if (patch.baseMaterialId) {
			return {
				value: {
					name: `${entity.name} Material`,
					baseMaterialId: patch.baseMaterialId,
					baseTextureId: patch.baseTextureId,
					roughness,
					metalness
				},
				requiresBaseDecision: false,
				shareMode: null
			};
		}
		if (decision.baseMaterialId) {
			return {
				value: {
					name: `${entity.name} Material`,
					baseMaterialId: decision.baseMaterialId,
					baseTextureId: patch.baseTextureId,
					roughness,
					metalness
				},
				requiresBaseDecision: false,
				shareMode: null
			};
		}
		// Model first assignment without a base material → queue for dialog.
		return { value: null, requiresBaseDecision: true, shareMode: null };
	}

	findCurrentInstance(
		entity: SceneModelEntity | ScenePrimitiveEntity
	): SceneMaterialInstance | undefined {
		const id = entity.materialInstanceId;
		if (!id) return undefined;
		return this.host.document.materials.find((instance) => instance.id === id);
	}

	#materialInstanceEquals(a: SceneMaterialInstance, b: SceneMaterialInstance): boolean {
		if (a.id !== b.id) return false;
		if (a.name !== b.name) return false;
		if (a.baseMaterialId !== b.baseMaterialId) return false;
		if ((a.baseTextureId ?? null) !== (b.baseTextureId ?? null)) return false;
		if ((a.roughness ?? null) !== (b.roughness ?? null)) return false;
		if ((a.metalness ?? null) !== (b.metalness ?? null)) return false;
		return true;
	}

	writeMaterialInstance(target: SceneMaterialInstance, source: SceneMaterialInstance) {
		target.name = source.name;
		target.baseMaterialId = source.baseMaterialId;
		if ('baseTextureId' in source) {
			if (source.baseTextureId === undefined) delete target.baseTextureId;
			else target.baseTextureId = source.baseTextureId;
		} else {
			delete target.baseTextureId;
		}
		if ('roughness' in source) {
			if (source.roughness === undefined) delete target.roughness;
			else target.roughness = source.roughness;
		} else {
			delete target.roughness;
		}
		if ('metalness' in source) {
			if (source.metalness === undefined) delete target.metalness;
			else target.metalness = source.metalness;
		} else {
			delete target.metalness;
		}
	}
}

function ownerEntityId(document: SceneDocument, instanceId: string): string | null {
	for (const entity of document.entities) {
		if (
			(entity.kind === 'model' || entity.kind === 'primitive') &&
			entity.materialInstanceId === instanceId
		) {
			return entity.id;
		}
	}
	return null;
}

function deriveTextureName(uri: string): string {
	const last = uri.split('/').pop() ?? '';
	const stripped = last.replace(/\.[^.]+$/, '');
	return stripped || 'Texture';
}
