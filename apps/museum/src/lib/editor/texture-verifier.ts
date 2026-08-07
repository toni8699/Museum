import { isSafeTextureUri } from '$lib/content/texture-uri';
import { loadSourceTexture } from '$lib/museum/materials/texture-cache';
import type { MaterialTextureSlot } from '$lib/types/materials';
import type { Texture as ThreeTexture } from 'three';

export type TextureSourceLoader = (
	uri: string,
	slot: MaterialTextureSlot
) => Promise<ThreeTexture>;

export type TextureVerificationResult =
	| { status: 'ready' }
	| { status: 'unsafe-uri'; message: string }
	| { status: 'load-failed'; message: string };

export type TextureVerifier = (uri: string) => Promise<TextureVerificationResult>;

/**
 * Editor-only verifier. URI safety is checked before any loader call and
 * concurrent checks for the same URI share one pending promise. Failures
 * are NOT cached permanently; retries re-invoke the loader.
 *
 * The default `loadSource` is `texture-cache.loadSourceTexture`, so a
 * registered URI produces exactly one `THREE.Texture` shared with the
 * renderer. Tests inject a deterministic loader.
 */
export function createTextureVerifier(
	loadSource?: TextureSourceLoader
): TextureVerifier {
	const loader = loadSource ?? loadSourceTexture;
	const pending = new Map<string, Promise<TextureVerificationResult>>();

	function attempt(uri: string): Promise<TextureVerificationResult> {
		return loader(uri, 'map').then(
			() => ({ status: 'ready' }) as TextureVerificationResult,
			(error: unknown) =>
				({
					status: 'load-failed',
					message: error instanceof Error ? error.message : String(error)
				}) as TextureVerificationResult
		);
	}

	return (uri: string) => {
		if (!isSafeTextureUri(uri)) {
			return Promise.resolve({
				status: 'unsafe-uri',
				message: `Texture URI must be a safe root-relative public path: ${uri}`
			} satisfies TextureVerificationResult);
		}
		const inflight = pending.get(uri);
		if (inflight) return inflight;
		const next = attempt(uri).finally(() => pending.delete(uri));
		pending.set(uri, next);
		return next;
	};
}
