export type LayoutTransactionCommit<T> = {
	changed: boolean;
	before: T | null;
};

export type LayoutTransaction<T> = {
	begin(current: T): boolean;
	commit(next: T): LayoutTransactionCommit<T>;
	cancel(): T | null;
	readonly isActive: boolean;
};

export function createLayoutTransaction<T>(
	clone: (value: T) => T = jsonClone
): LayoutTransaction<T> {
	let before: T | null = null;

	return {
		begin(current) {
			if (before !== null) return false;
			before = clone(current);
			return true;
		},
		commit(next) {
			if (before === null) return { changed: false, before: null };
			const original = before;
			const changed = JSON.stringify(original) !== JSON.stringify(next);
			before = null;
			return { changed, before: changed ? clone(original) : null };
		},
		cancel() {
			if (before === null) return null;
			const original = clone(before);
			before = null;
			return original;
		},
		get isActive() {
			return before !== null;
		}
	};
}

function jsonClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
