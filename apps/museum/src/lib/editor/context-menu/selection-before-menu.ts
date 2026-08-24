/**
 * P3.4 — selection-before-menu contract.
 *
 * Right-clicking an unselected entity selects it first, then opens the menu,
 * so menu commands act on the clicked target through the same commands the
 * Inspector/kebab use. Right-clicking an entity that is ALREADY selected must
 * keep the whole current selection intact — re-selecting a member of a
 * multi-selection would silently collapse it and change what
 * `duplicateSelection()`/`deleteSelection()` act on. Right-clicking empty
 * space never changes selection (and surfaces without an approved
 * empty-space menu do not open a custom menu at all).
 */
export type SelectionMenuDecision = 'keep-selection' | 'select-target';

export function resolveSelectionBeforeMenu(input: {
	targetSelected: boolean;
	/** Current multi-selection size the menu would otherwise collapse. */
	selectionSize: number;
}): SelectionMenuDecision {
	void input.selectionSize;
	return input.targetSelected ? 'keep-selection' : 'select-target';
}
