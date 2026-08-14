import { describe, expect, it } from 'vitest';

import { archProfileTopAt, buildArchProfile } from '$lib/editor/layout/arch-profile';

describe('A3 arch profiles', () => {
	it('derives rectangular profile without extra geometry', () => {
		const result = buildArchProfile('rectangular', 2, 2);
		expect(result.issues).toEqual([]);
		expect(result.profile?.topBoundary).toEqual([[0, 2], [2, 2]]);
	});

	it('builds rounded semicircle from width and height', () => {
		const result = buildArchProfile('rounded', 2, 2);
		expect(result.issues).toEqual([]);
		expect(result.profile?.rise).toBe(1);
		expect(archProfileTopAt(result.profile!, 1)).toBeCloseTo(2);
	});

	it('builds pointed profile with derived apex', () => {
		const result = buildArchProfile('pointed', 2, 2);
		expect(result.issues).toEqual([]);
		expect(result.profile?.topBoundary).toEqual([[0, 1], [1, 2], [2, 1]]);
	});

	it('rejects arch rise larger than opening height', () => {
		expect(buildArchProfile('rounded', 2, 0.9).issues[0]?.code).toBe('rounded_arch_rise_exceeds_height');
		expect(buildArchProfile('pointed', 2, 0.9).issues[0]?.code).toBe('pointed_arch_rise_exceeds_height');
	});
});
