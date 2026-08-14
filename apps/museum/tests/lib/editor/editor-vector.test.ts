import { describe, expect, it } from 'vitest';
import {
	createEditorVec3Drafts,
	editorVec3Changed,
	parseEditorVec3Drafts,
	type EditorVec3Drafts
} from '$lib/editor/editor-vector';

describe('atomic editor vector drafts', () => {
	it('parses one complete finite vector and detects whole-vector changes', () => {
		expect(parseEditorVec3Drafts(['1.25', '-2', '3e1'])).toEqual([1.25, -2, 30]);
		expect(editorVec3Changed([1, 2, 3], [1, 2, 3])).toBe(false);
		expect(editorVec3Changed([1, 2, 4], [1, 2, 3])).toBe(true);
	});

	it.each([
		['', '2', '3'],
		[' ', '2', '3'],
		['-', '2', '3'],
		['+', '2', '3'],
		['.', '2', '3'],
		['NaN', '2', '3'],
		['Infinity', '2', '3'],
		['1', '-Infinity', '3'],
		['1', '2', 'not-a-number']
	] satisfies EditorVec3Drafts[])('rejects incomplete or non-finite drafts: %o', (...drafts) => {
		expect(parseEditorVec3Drafts(drafts as EditorVec3Drafts)).toBeNull();
	});

	it('creates stable committed drafts for invalid or unchanged restoration', () => {
		expect(createEditorVec3Drafts([1, -2.5, 0.125])).toEqual(['1', '-2.5', '0.125']);
	});
});
