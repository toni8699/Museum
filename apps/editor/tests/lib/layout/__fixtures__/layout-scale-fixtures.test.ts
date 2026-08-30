import { describe, expect, it } from 'vitest';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { validateLayoutDocument } from '$lib/layout/layout-codec';
import {
	buildScaleFixture,
	SCALE_FIXTURE_SEEDS,
	type ScaleFixtureTier
} from './layout-scale-fixtures';

describe('layout-scale-fixtures', () => {
	it('is byte-deterministic for a given seed', () => {
		const first = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const second = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it('differs across seeds', () => {
		const small = buildScaleFixture(SCALE_FIXTURE_SEEDS.small);
		const medium = buildScaleFixture(SCALE_FIXTURE_SEEDS.medium);
		expect(JSON.stringify(small)).not.toBe(JSON.stringify(medium));
	});

	it.each<[ScaleFixtureTier, number]>(Object.entries(SCALE_FIXTURE_SEEDS).map(([tier, spec]) => [tier as ScaleFixtureTier, spec.roomCount]))(
		'emits the requested room and object counts for %s (%i rooms)',
		(_tier, roomCount) => {
			const tier = _tier as ScaleFixtureTier;
			const spec = SCALE_FIXTURE_SEEDS[tier];
			const document = buildScaleFixture(spec);
			expect(document.floors[0]!.rooms).toHaveLength(roomCount);
			expect(document.objects).toHaveLength(roomCount * spec.objectsPerRoom);
		}
	);

	it('reflects the pinned mix at every scale', () => {
		for (const tier of ['small', 'medium', 'large'] as const) {
			const spec = SCALE_FIXTURE_SEEDS[tier];
			const document = buildScaleFixture(spec);
			const rooms = document.floors[0]!.rooms;
			const bezierRooms = rooms.filter((room) => room.boundary.segments.some((segment) => segment.kind === 'auto-bezier'));
			const bezierFraction = bezierRooms.length / rooms.length;
			expect(bezierFraction).toBeGreaterThan(0.1);
			expect(bezierFraction).toBeLessThan(0.6);

			const openings = rooms.flatMap((room) => room.openings);
			expect(openings).toHaveLength(roomCountFor(tier) * spec.openingsPerRoom);
			expect(openings.every((opening) => ['rectangular', 'rounded', 'pointed'].includes(opening.profile))).toBe(true);
			expect(openings.some((opening) => opening.kind === 'door')).toBe(true);
			expect(openings.some((opening) => opening.kind === 'window')).toBe(true);

			const kinds = new Set(document.objects.map((object) => object.kind));
			expect(kinds.size).toBeGreaterThan(2);
		}
	});

	it('passes the strict codec and compiles with zero blocking issues at small and medium scales', () => {
		for (const tier of ['small', 'medium'] as const) {
			const document = buildScaleFixture(SCALE_FIXTURE_SEEDS[tier]);
			const validated = validateLayoutDocument(document);
			expect(validated.success, `codec rejected ${tier}: ${JSON.stringify(validated.success ? [] : validated.issues)}`).toBe(true);

			const { issues } = compileLayoutGeometry(document);
			const blocking = issues.filter((issue) => issue.severity !== 'warning');
			expect(blocking, `blocking issues at ${tier}: ${JSON.stringify(blocking.slice(0, 3))}`).toEqual([]);
		}
	}, 30000);

	it('compiles the 1,000-room fixture with zero blocking issues', () => {
		const document = buildScaleFixture(SCALE_FIXTURE_SEEDS.large);
		const { geometry, issues } = compileLayoutGeometry(document);
		const blocking = issues.filter((issue) => issue.severity !== 'warning');
		expect(blocking, `blocking issues: ${JSON.stringify(blocking.slice(0, 3))}`).toEqual([]);
		expect(geometry.rooms).toHaveLength(SCALE_FIXTURE_SEEDS.large.roomCount);
	}, 60000);
});

function roomCountFor(tier: ScaleFixtureTier): number {
	return SCALE_FIXTURE_SEEDS[tier].roomCount;
}
