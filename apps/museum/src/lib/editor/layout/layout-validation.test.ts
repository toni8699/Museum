import { describe, expect, it } from 'vitest';

import { roomsToLayout } from './rooms-to-layout';
import {
	createA1BezierDocument,
	createA1CorridorDocument,
	createA1LDocument,
	createA1RectangleDocument
} from './layout-a1-fixtures';
import { validateLayoutDocumentGeometry, validateLineRoom } from './layout-validation';

describe('A1 layout validation', () => {
	it('accepts rectangle, L-shaped, corridor, and compiled Chopin line rooms', () => {
		expect(validateLayoutDocumentGeometry(createA1RectangleDocument())).toEqual([]);
		expect(validateLayoutDocumentGeometry(createA1LDocument())).toEqual([]);
		expect(validateLayoutDocumentGeometry(createA1CorridorDocument())).toEqual([]);
		expect(validateLayoutDocumentGeometry(roomsToLayout())).toEqual([]);
	});

	it('defers Bezier geometry to A3', () => {
		const issues = validateLayoutDocumentGeometry(createA1BezierDocument());
		expect(issues.map((issue) => issue.code)).toContain('bezier-deferred');
	});

	it('rejects disconnected and zero-length boundaries', () => {
		const document = createA1RectangleDocument();
		const segments = document.floors[0]!.rooms[0]!.boundary.segments;
		segments[0] = { ...segments[0]!, end: [99, 99] };
		segments[1] = { ...segments[1]!, start: [0, 0] };
		segments[2] = { ...segments[2]!, end: segments[2]!.start };
		const codes = validateLayoutDocumentGeometry(document).map((issue) => issue.code);
		expect(codes).toContain('disconnected_boundary');
		expect(codes).toContain('zero_length_segment');
	});

	it('rejects self-intersecting boundaries', () => {
		const document = createA1RectangleDocument();
		document.floors[0]!.rooms[0]!.boundary.segments = [
			{ id: 'a', kind: 'line', start: [0, 0], end: [4, 4] },
			{ id: 'b', kind: 'line', start: [4, 4], end: [0, 4] },
			{ id: 'c', kind: 'line', start: [0, 4], end: [4, 0] },
			{ id: 'd', kind: 'line', start: [4, 0], end: [0, 0] }
		];
		expect(validateLayoutDocumentGeometry(document).map((issue) => issue.code)).toContain('self_intersection');
	});

	it('rejects out-of-range and overlapping openings', () => {
		const document = createA1RectangleDocument();
		document.floors[0]!.rooms[0]!.openings = [
			{ id: 'opening-a', segmentId: 'room:4:0', kind: 'door', offset: 1, width: 2, height: 2, sillHeight: 0, profile: 'rectangular' },
			{ id: 'opening-b', segmentId: 'room:4:0', kind: 'window', offset: 2, width: 2, height: 1, sillHeight: 1, profile: 'rectangular' },
			{ id: 'opening-c', segmentId: 'room:4:0', kind: 'door', offset: 9, width: 2, height: 2, sillHeight: 0, profile: 'rectangular' }
		];
		const codes = validateLayoutDocumentGeometry(document).map((issue) => issue.code);
		expect(codes).toContain('opening_overlap');
		expect(codes).toContain('opening_out_of_bounds');
	});

	it('uses endpoint tolerance for room closure', () => {
		const document = createA1RectangleDocument();
		const segments = document.floors[0]!.rooms[0]!.boundary.segments;
		segments[3] = { ...segments[3]!, end: [0.0000005, 0.0000005] };
		expect(validateLineRoom(document.floors[0]!.rooms[0]!, document.floors[0]!)).toEqual([]);
	});
});
