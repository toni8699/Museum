import type { Vec3 } from '$lib/types/scene';

export type EditorVec3Drafts = [string, string, string];

export function formatEditorVectorComponent(value: number) {
	return value.toFixed(3).replace(/\.?0+$/, '') || '0';
}

export function createEditorVec3Drafts(value: Vec3): EditorVec3Drafts {
	return value.map(formatEditorVectorComponent) as EditorVec3Drafts;
}

/** Parse one complete vector form. Partial and non-finite numeric drafts are invalid. */
export function parseEditorVec3Drafts(drafts: EditorVec3Drafts): Vec3 | null {
	const parsed = drafts.map((draft) => {
		const trimmed = draft.trim();
		if (!trimmed || trimmed === '-' || trimmed === '+' || trimmed === '.') {
			return Number.NaN;
		}
		return Number(trimmed);
	});
	return parsed.every(Number.isFinite) ? (parsed as Vec3) : null;
}

export function editorVec3Changed(next: Vec3, committed: Vec3) {
	return next[0] !== committed[0] || next[1] !== committed[1] || next[2] !== committed[2];
}
