/**
 * P3.4 — editable-target interception boundary.
 *
 * `contextmenu` is only prevented/customized OUTSIDE editable targets; text
 * inputs, textareas, selects, and contentEditable hosts keep the browser's
 * native copy/paste/spellcheck menu.
 *
 * Duck-typed (no `instanceof Element`) so the classifier stays unit-testable
 * in the node test environment: real DOM elements carry both fields; global
 * targets like `window`/`document` have no string `tagName` and classify as
 * non-editable, matching the browser semantics this guard relies on.
 */

type EditableLike = {
	readonly isContentEditable?: boolean;
	readonly tagName?: unknown;
};

export function isEditableElement(element: EditableLike | null | undefined): boolean {
	if (!element) return false;
	if (element.isContentEditable) return true;
	const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function isEditableTarget(target: EventTarget | null): boolean {
	return isEditableElement(target as EditableLike | null);
}
