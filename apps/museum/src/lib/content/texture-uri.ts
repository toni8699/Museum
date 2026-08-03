export function isSafeTextureUri(uri: string): boolean {
	if (
		!uri.startsWith('/') ||
		uri.startsWith('//') ||
		uri.includes('\\') ||
		uri.includes('?') ||
		uri.includes('#')
	) {
		return false;
	}
	let decoded = uri;
	let stable = false;
	for (let depth = 0; depth < 8; depth += 1) {
		let next: string;
		try {
			next = decodeURIComponent(decoded);
		} catch {
			return false;
		}
		if (next === decoded) {
			stable = true;
			break;
		}
		decoded = next;
	}
	if (!stable) return false;
	if (
		!decoded.startsWith('/') ||
		decoded.startsWith('//') ||
		decoded.includes('\\') ||
		decoded.includes('?') ||
		decoded.includes('#') ||
		/[\u0000-\u001f\u007f]/.test(decoded)
	) {
		return false;
	}
	const segments = decoded.split('/');
	return segments.every((segment) => segment !== '.' && segment !== '..');
}
