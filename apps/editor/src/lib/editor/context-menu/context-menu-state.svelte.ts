/**
 * P3.4 — shared context-menu state. One reactive slot at the editor
 * composition root; every surface adapter opens through it, so only one menu
 * can be alive at a time and the shell owns dismissal.
 */

export type ContextMenuItem = {
	id: string;
	label: string;
	/** When set, the item renders disabled with this reason and never runs. */
	disabledReason?: string | null;
	/** Destructive actions render with the danger treatment (§7). */
	danger?: boolean;
	separatorBefore?: boolean;
	run: () => void;
};

export type ContextMenuRequest = {
	/** Owning surface, e.g. 'scene-3d' | 'scene-plan-layout' | 'scene-plan-arrange' | 'outliner' | 'camera-plan' | 'camera-3d' | 'camera-timeline'. */
	surfaceId: string;
	/** Viewport coordinates for the menu anchor. */
	x: number;
	y: number;
	items: readonly ContextMenuItem[];
};

const KEY = Symbol('editor-context-menu');

export type EditorContextMenuStore = {
	readonly menu: ContextMenuRequest | null;
	open(request: ContextMenuRequest): void;
	close(): void;
};

export function createEditorContextMenuStore(): EditorContextMenuStore {
	let menu = $state<ContextMenuRequest | null>(null);
	return {
		get menu() {
			return menu;
		},
		open(request: ContextMenuRequest) {
			menu = request;
		},
		close() {
			menu = null;
		}
	};
}

export const EDITOR_CONTEXT_MENU_KEY = KEY;

/**
 * Pure helper — clamp an anchored menu box inside the viewport with a small
 * margin, flipping up/left when it would overflow. Unit-testable.
 */
export function clampMenuPosition(
	x: number,
	y: number,
	menuWidth: number,
	menuHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	margin = 8
): { x: number; y: number } {
	const maxX = Math.max(margin, viewportWidth - menuWidth - margin);
	const maxY = Math.max(margin, viewportHeight - menuHeight - margin);
	return {
		x: Math.min(Math.max(x, margin), maxX),
		y: Math.min(Math.max(y, margin), maxY)
	};
}
