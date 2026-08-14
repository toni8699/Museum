/**
 * Measurement core for the G3 performance harness. Browser-agnostic (no Node
 * `process`, no DOM, no Three) so both the vitest Node tier and the `/dev/perf`
 * browser tier share the same warm-up/sample/aggregation rules.
 */

export type TimingOptions = {
	warmup: number;
	samples: number;
	/** Operations per sample; raise for sub-millisecond operations. */
	iterations?: number;
};

export function percentile(values: readonly number[], pct: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
	return sorted[index]!;
}

export function summarize(values: readonly number[]): { value: number; p50: number; p95: number } {
	return {
		value: values.length ? Math.min(...values) : 0,
		p50: percentile(values, 50),
		p95: percentile(values, 95)
	};
}

/**
 * Run `op` `warmup` times (discarded), then `samples` times (each `iterations`
 * operations), returning the per-operation median/p95. `value` is the median so
 * a stray GC pause doesn't dominate the representative number.
 */
export function timeOp(op: () => unknown, options: TimingOptions): { value: number; p50: number; p95: number } {
	const iterations = options.iterations ?? 1;
	for (let index = 0; index < options.warmup; index += 1) op();

	const times: number[] = [];
	for (let sample = 0; sample < options.samples; sample += 1) {
		const start = performance.now();
		for (let index = 0; index < iterations; index += 1) op();
		times.push((performance.now() - start) / iterations);
	}

	const { p50, p95 } = summarize(times);
	return { value: p50, p50, p95 };
}
