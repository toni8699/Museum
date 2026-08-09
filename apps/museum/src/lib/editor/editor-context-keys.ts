/**
 * Phase 6.2 — symbols for editor context keys shared between
 * `MuseumEditorApp.svelte` and downstream consumers
 * (`EditorViewportToolbar.svelte`, `EditorSettingsPopover.svelte`).
 */

export const EDITOR_OPEN_SETTINGS_KEY = Symbol('museum-editor:open-settings');
export type EditorOpenSettingsHandle = {
	readonly open: boolean;
	toggle(): void;
	set(value: boolean): void;
};
