import { isSafeTextureUri } from '$lib/content/texture-uri';

function hasBrowserImage(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof document !== 'undefined' &&
		typeof globalThis.Image !== 'undefined'
	);
}

export type TextureVerificationResult =
	| { success: true }
	| {
			success: false;
			code: 'unsafe-uri' | 'load-failed';
			message: string;
	  };

export type TextureImageLoader = (uri: string) => Promise<void>;
export type TextureVerifier = (uri: string) => Promise<TextureVerificationResult>;

/**
 * Browser-backed loader. Uses `new Image()` + async decoding so a failed
 * decode (corrupt file, wrong MIME) reports as `load-failed` rather than
 * hanging on the deferred `load` event.
 */
export function loadBrowserTextureImage(uri: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const image = new globalThis.Image();
		let settled = false;

		const settle = (kind: 'resolve' | 'reject') => {
			if (settled) return;
			settled = true;
			if (kind === 'resolve') resolve();
			else reject(new Error(`Texture image failed to load: ${uri}`));
		};

		image.decoding = 'async';
		image.onload = () => {
			const decode = (image as HTMLImageElement & { decode?: () => Promise<void> }).decode;
			if (typeof decode !== 'function') {
				settle('resolve');
				return;
			}
			decode.call(image).then(() => settle('resolve'), () => settle('reject'));
		};
		image.onerror = () => settle('reject');
		image.src = uri;
	});
}

/**
 * Editor-only verifier. URI safety is checked before any loader call and
 * concurrent checks for the same URI share one pending promise. Failed
 * checks delete their map entry so retries can re-attempt the load.
 *
 * Pass `loadImage` to inject a deterministic loader for tests. The default
 * loader only resolves in the browser; node test environments must inject.
 */
export function createTextureVerifier(
	loadImage?: TextureImageLoader
): TextureVerifier {
	const pending = new Map<string, Promise<TextureVerificationResult>>();
	const resolveLoader = loadImage ?? defaultLoader;

	function attempt(uri: string): Promise<TextureVerificationResult> {
		return resolveLoader(uri).then(
			() => ({ success: true }) as TextureVerificationResult,
			() =>
				({
					success: false,
					code: 'load-failed',
					message: `Texture image failed to load: ${uri}`
				}) as TextureVerificationResult
		);
	}

	return (uri: string) => {
		if (!isSafeTextureUri(uri)) {
			return Promise.resolve({
				success: false,
				code: 'unsafe-uri',
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

function defaultLoader(uri: string): Promise<void> {
	if (!hasBrowserImage()) {
		return Promise.reject(new Error(`Texture loaders require a browser: ${uri}`));
	}
	return loadBrowserTextureImage(uri);
}
