/**
 * Shared mutation / interaction / undo guards (Phase 9.1).
 *
 * Extracted from `MuseumEditorStore` so future controllers (nav mutator,
 * view-keyframe, timeline) share one predicate surface instead of re-copying
 * preview × interaction × history checks.
 *
 * Host supplies preview + interaction flags + history transaction gate;
 * this module owns only the Boolean composition.
 */

import type { EditorCameraPreview } from '../museum-editor.types';
import type { EditorViewKeyframeProgressDragSelection } from '../museum-editor.types';

export interface EditorMutationGuardsHost {
	readonly cameraPreview: EditorCameraPreview | null;
	readonly transformInteractionActive: boolean;
	readonly directPathInteractionActive: boolean;
	readonly directFramingInteractionActive: boolean;
	readonly viewKeyframeProgressDrag: EditorViewKeyframeProgressDragSelection | null;
	/** True while a document/framing transaction is open on the history controller. */
	readonly historyDocumentUndoBlocked: boolean;
}

export class EditorMutationGuards {
	constructor(private readonly host: EditorMutationGuardsHost) {}

	/** Visitor and active Director transport own immutable document state. */
	get isDocumentMutationBlocked(): boolean {
		const preview = this.host.cameraPreview;
		return Boolean(
			preview && (preview.mode === 'visitor' || preview.transport !== 'paused')
		);
	}

	/** Framing is editable through either camera while paused, but never during playback. */
	get isCameraFramingMutationBlocked(): boolean {
		const preview = this.host.cameraPreview;
		return Boolean(preview && preview.transport !== 'paused');
	}

	get isEditorInteractionActive(): boolean {
		return (
			this.host.transformInteractionActive ||
			this.host.directPathInteractionActive ||
			this.host.directFramingInteractionActive ||
			this.host.viewKeyframeProgressDrag !== null
		);
	}

	/**
	 * History is only blocked while a preview is playing or a drag/transaction is live.
	 * Paused Visitor previews do not lock undo.
	 */
	get isDocumentUndoBlocked(): boolean {
		const preview = this.host.cameraPreview;
		return Boolean(
			this.isEditorInteractionActive ||
				this.host.historyDocumentUndoBlocked ||
				(preview && preview.transport !== 'paused')
		);
	}
}
