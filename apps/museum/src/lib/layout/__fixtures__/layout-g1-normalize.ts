/**
 * Test-only numeric normalizer. Rounds every number to a documented tolerance
 * so parity assertions compare geometry numerically without hand-rounding
 * production code.
 */
export const G1_NORMALIZE_DECIMALS = 6;
const FACTOR = 10 ** G1_NORMALIZE_DECIMALS;

export function normalizeForParity<T>(value: T): T {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return value;
		return (Math.round(value * FACTOR) / FACTOR) as unknown as T;
	}
	if (Array.isArray(value)) return value.map((entry) => normalizeForParity(entry)) as unknown as T;
	if (value !== null && typeof value === 'object') {
		const output: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			output[key] = normalizeForParity(entry);
		}
		return output as unknown as T;
	}
	return value;
}
