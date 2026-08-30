/**
 * P3B.1 — one shared click-vs-drag threshold for the editor.
 *
 * Previously each surface kept its own private 4 px copy (EditorSelection,
 * Camera Plan, layout wall-bend). Pointer gesture owners must import this
 * constant rather than duplicating a threshold, so the orientation widget and
 * every existing surface agree on when a press becomes a drag.
 */
export const EDITOR_DRAG_THRESHOLD_PX = 4;
