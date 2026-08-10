import { describe, expect, it } from 'vitest';

import type { LayoutDocument, LayoutRoom } from './layout-types';
import {
	createEmptyLayoutDocument,
	LayoutDocumentValidationError,
	parseLayoutDocumentJson,
	serializeLayoutDocument,
	validateLayoutDocument
} from './layout-codec';

function rectangleRoom(id = 'room-main'): LayoutRoom {
	return {
		id,
		name: 'Main Room',
		boundary: {
			closed: true,
			segments: [
				{ id: 'wall-a', kind: 'line', start: [0, 0], end: [6, 0] },
				{ id: 'wall-b', kind: 'line', start: [6, 0], end: [6, 4] },
				{ id: 'wall-c', kind: 'line', start: [6, 4], end: [0, 4] },
				{ id: 'wall-d', kind: 'line', start: [0, 4], end: [0, 0] }
			]
		},
		wallThickness: 0.2,
		floorThickness: 0.1,
		ceilingThickness: 0.1,
		openings: []
	};
}

function baseDocument(): LayoutDocument {
	return {
		formatVersion: 1,
		units: 'meters',
		floors: [
			{
				id: 'floor-ground',
				name: 'Ground Floor',
				elevation: 0,
				height: 3,
				rooms: [rectangleRoom()]
			}
		],
		objects: []
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function successDocument(input: unknown): LayoutDocument {
	const result = validateLayoutDocument(input);
	if (!result.success) {
		throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
	}
	return result.document;
}

function issueCodes(input: unknown): string[] {
	const result = validateLayoutDocument(input);
	return result.success ? [] : result.issues.map((issue) => issue.code);
}

describe('LayoutDocument codec', () => {
	it('creates and validates the canonical blank document', () => {
		const document = createEmptyLayoutDocument();
		expect(document).toEqual({ formatVersion: 1, units: 'meters', floors: [], objects: [] });
		expect(successDocument(document)).toEqual(document);
	});

	it('round-trips a rectangle fixture', () => {
		const document = baseDocument();
		const result = validateLayoutDocument(document);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(parseLayoutDocumentJson(result.canonicalJson)).toEqual(result);
	});

	it('round-trips an L-shaped fixture', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.boundary.segments = [
			{ id: 'a', kind: 'line', start: [0, 0], end: [6, 0] },
			{ id: 'b', kind: 'line', start: [6, 0], end: [6, 3] },
			{ id: 'c', kind: 'line', start: [6, 3], end: [3, 3] },
			{ id: 'd', kind: 'line', start: [3, 3], end: [3, 6] },
			{ id: 'e', kind: 'line', start: [3, 6], end: [0, 6] },
			{ id: 'f', kind: 'line', start: [0, 6], end: [0, 0] }
		];
		expect(successDocument(document)).toEqual(document);
	});

	it('round-trips a triangle fixture', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.boundary.segments = [
			{ id: 'a', kind: 'line', start: [0, 0], end: [6, 0] },
			{ id: 'b', kind: 'line', start: [6, 0], end: [3, 4] },
			{ id: 'c', kind: 'line', start: [3, 4], end: [0, 0] }
		];
		expect(successDocument(document)).toEqual(document);
	});

	it('round-trips a closed Bezier fixture as data', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.boundary.segments = [
			{
				id: 'curve-a',
				kind: 'bezier',
				start: [0, 0],
				handleOut: [2, -1],
				handleIn: [4, -1],
				end: [6, 0]
			},
			{ id: 'line-b', kind: 'line', start: [6, 0], end: [6, 4] },
			{ id: 'line-c', kind: 'line', start: [6, 4], end: [0, 4] },
			{ id: 'line-d', kind: 'line', start: [0, 4], end: [0, 0] }
		];
		expect(successDocument(document)).toEqual(document);
	});

	it('round-trips multiple rectangular openings on a skinny corridor room', () => {
		const document = baseDocument();
		const room = document.floors[0]!.rooms[0]!;
		room.name = 'Corridor';
		room.openings = [
			{
				id: 'opening-west',
				segmentId: 'wall-d',
				kind: 'door',
				offset: 1,
				width: 0.9,
				height: 2.1,
				sillHeight: 0,
				profile: 'rectangular'
			},
			{
				id: 'opening-east',
				segmentId: 'wall-b',
				kind: 'door',
				offset: 1,
				width: 0.9,
				height: 2.1,
				sillHeight: 0,
				profile: 'rectangular'
			}
		];
		expect(successDocument(document)).toEqual(document);
	});

	it('round-trips a profile object with a closed path', () => {
		const document = baseDocument();
		document.objects.push({
			id: 'table-profile',
			kind: 'profile',
			position: [1, 0, 1],
			rotation: [0, 0, 0],
			dimensions: [1, 1, 1],
			profile: {
				closed: true,
				segments: [
					{ id: 'p-a', kind: 'line', start: [0, 0], end: [1, 0] },
					{ id: 'p-b', kind: 'line', start: [1, 0], end: [1, 1] },
					{ id: 'p-c', kind: 'line', start: [1, 1], end: [0, 1] },
					{ id: 'p-d', kind: 'line', start: [0, 1], end: [0, 0] }
				]
			}
		});
		expect(successDocument(document)).toEqual(document);
	});

	it('rejects unsupported format versions and units', () => {
		const document = baseDocument() as unknown as Record<string, unknown>;
		document.formatVersion = 2;
		document.units = 'feet';
		expect(issueCodes(document)).toEqual(['unsupported_version', 'unsupported_units']);
	});

	it('rejects unknown root and nested keys', () => {
		const document = baseDocument() as unknown as Record<string, unknown>;
		document.extra = true;
		const floor = (document.floors as Record<string, unknown>[])[0]!;
		floor.extra = true;
		const result = validateLayoutDocument(document);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.issues.map((issue) => issue.code)).toContain('unknown_key');
		expect(result.issues.some((issue) => issue.path === '$.floors[0].extra')).toBe(true);
	});

	it('rejects missing fields and wrong types', () => {
		const document = baseDocument() as unknown as Record<string, unknown>;
		delete document.objects;
		(document.floors as unknown[])[0] = 'floor';
		expect(issueCodes(document)).toContain('invalid_type');
	});

	it('rejects invalid and duplicate scoped IDs', () => {
		const invalidDocument = baseDocument();
		invalidDocument.floors[0]!.rooms.push(rectangleRoom('room main'));
		expect(issueCodes(invalidDocument)).toContain('invalid_id');

		const duplicateDocument = baseDocument();
		duplicateDocument.objects.push(
			{
				id: 'object-a',
				kind: 'box',
				position: [0, 0, 0],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1]
			},
			{
				id: 'object-a',
				kind: 'box',
				position: [1, 0, 1],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1]
			}
		);
		expect(issueCodes(duplicateDocument)).toContain('duplicate_id');
	});

	it('rejects non-finite and non-positive values', () => {
		const document = baseDocument();
		document.floors[0]!.height = Number.NaN;
		document.floors[0]!.rooms[0]!.wallThickness = 0;
		const codes = issueCodes(document);
		expect(codes).toContain('invalid_number');
		expect(codes).toContain('invalid_value');
	});

	it('rejects an unclosed room or profile path', () => {
		const document = baseDocument() as unknown as Record<string, unknown>;
		const room = (document.floors as Record<string, unknown>[])[0]!.rooms as Record<string, unknown>[];
		room[0]!.boundary = { closed: false, segments: [] };
		expect(issueCodes(document)).toContain('invalid_value');
	});

	it('rejects an opening that references a missing segment', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.openings.push({
			id: 'door-missing-segment',
			segmentId: 'missing',
			kind: 'door',
			offset: 0,
			width: 1,
			height: 2,
			sillHeight: 0,
			profile: 'rectangular'
		});
		expect(issueCodes(document)).toContain('missing_reference');
	});

	it('rejects negative opening offsets and dimensions', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.openings.push({
			id: 'bad-opening',
			segmentId: 'wall-a',
			kind: 'window',
			offset: -1,
			width: 0,
			height: 1,
			sillHeight: -1,
			profile: 'rectangular'
		});
		const codes = issueCodes(document);
		expect(codes.filter((code) => code === 'invalid_value').length).toBeGreaterThanOrEqual(3);
	});

	it('reports malformed JSON as an issue', () => {
		const result = parseLayoutDocumentJson('{');
		expect(result).toEqual({
			success: false,
			issues: [
				{
					path: '$',
					code: 'invalid_json',
					message: 'Invalid JSON near line 1, column 2.'
				}
			]
		});
	});

	it('produces deterministic canonical JSON', () => {
		const document = baseDocument();
		const first = serializeLayoutDocument(document);
		const second = serializeLayoutDocument(clone(document));
		expect(first).toBe(second);
		expect(first.endsWith('\n')).toBe(true);
	});

	it('does not mutate input objects', () => {
		const document = baseDocument();
		const before = clone(document);
		validateLayoutDocument(document);
		expect(document).toEqual(before);
	});

	it('throws a typed error when serializing invalid data', () => {
		const document = baseDocument();
		document.units = 'meters' as const;
		document.floors[0]!.height = 0;
		expect(() => serializeLayoutDocument(document)).toThrow(LayoutDocumentValidationError);
	});

	it('accepts a structurally valid self-intersecting boundary for A1 to reject later', () => {
		const document = baseDocument();
		document.floors[0]!.rooms[0]!.boundary.segments = [
			{ id: 'cross-a', kind: 'line', start: [0, 0], end: [4, 4] },
			{ id: 'cross-b', kind: 'line', start: [4, 4], end: [0, 4] },
			{ id: 'cross-c', kind: 'line', start: [0, 4], end: [4, 0] },
			{ id: 'cross-d', kind: 'line', start: [4, 0], end: [0, 0] }
		];
		expect(successDocument(document)).toEqual(document);
	});
});
