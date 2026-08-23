/**
 * `editor/helpers/package-sha.ts` — SHA-256 helper used by Phase 5.4 package
 * format, importer, and exporter.
 *
 * **Single source for fingerprints.** Every `SceneTextureAsset.uri` that lives
 * in a `.scenepack.zip` is bookmarked by sha256(bytes) so the manifest can
 * verify integrity on re-import. The fingerprint format is a 64-char lowercase
 * hex digest prefixed by `sha256-` (matches the spec's `manifest.textures[*].fingerprint`).
 *
 * **Cross-runtime.** Uses `globalThis.crypto.subtle.digest('SHA-256', ...)` only.
 * Both Node 20+ and modern browsers expose this — no platform switch, no
 * dual API. Pure JS, async, no transitive deps. `Uint8Array.subarray` is shared
 * with the original buffer; we slice a fresh ArrayBuffer because some subtle
 * implementations reject views over larger capacity.
 */
export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
	const sub = new Uint8Array(bytes);
	const buf = sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength) as ArrayBuffer;
	const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
	return `sha256-${toHex(new Uint8Array(digest))}`;
}

function toHex(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 1) {
		const byte = bytes[i]!;
		out += byte.toString(16).padStart(2, '0');
	}
	return out;
}
