import { describe, expect, it } from 'vitest';

import { createLayoutTransaction } from '$lib/editor/layout/layout-transaction';

describe('A1 layout transaction', () => {
	it('allows one active transaction and snapshots input', () => {
		const transaction = createLayoutTransaction<{ value: number }>();
		const current = { value: 1 };
		expect(transaction.begin(current)).toBe(true);
		expect(transaction.isActive).toBe(true);
		expect(transaction.begin({ value: 2 })).toBe(false);
		current.value = 9;
		expect(transaction.cancel()).toEqual({ value: 1 });
		expect(transaction.isActive).toBe(false);
	});

	it('commits one changed snapshot', () => {
		const transaction = createLayoutTransaction<{ value: number }>();
		expect(transaction.begin({ value: 1 })).toBe(true);
		expect(transaction.commit({ value: 2 })).toEqual({
			changed: true,
			before: { value: 1 }
		});
		expect(transaction.isActive).toBe(false);
	});

	it('does not create a history snapshot for a no-op commit', () => {
		const transaction = createLayoutTransaction<{ value: number }>();
		expect(transaction.begin({ value: 1 })).toBe(true);
		expect(transaction.commit({ value: 1 })).toEqual({ changed: false, before: null });
		expect(transaction.isActive).toBe(false);
	});

	it('returns null when cancel or commit has no active transaction', () => {
		const transaction = createLayoutTransaction<{ value: number }>();
		expect(transaction.cancel()).toBeNull();
		expect(transaction.commit({ value: 1 })).toEqual({ changed: false, before: null });
	});
});
