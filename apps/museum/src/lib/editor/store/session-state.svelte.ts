/**
 * Editor session state — the Svelte 5 sub-store that owns volatile UI state
 * that lives only for the current editor session (refresh wipes).
 *
 * Slice 1 of the museum-editor refactor plan proves the composition-root
 * pattern for this concern. The full slot list from audit §3.C is broader;
 * this initial slice owns:
 *
 *  - `statusMessage`              — toast message + auto-clear timer
 *  - `viewportShowNodes`          — session-only viewport visibility flags
 *  - `viewportShowPaths`           (just landed in the viewport-toggles spec)
 *  - `viewportShowFraming`
 *
 * Other session slots (`currentWorkspace`, `leftPanel`, transform-mode /
 * tree-expansion / lighting / snap / keep-on-floor / focus-channel) remain on
 * the god file for Slice 1 and will migrate in later slices.
 */

const STATUS_MESSAGE_MS = 2500;

export class EditorSessionState {
	statusMessage = $state<string | null>(null);
	viewportShowNodes = $state(true);
	viewportShowPaths = $state(true);
	viewportShowFraming = $state(true);

	#statusMessageTimer: ReturnType<typeof setTimeout> | null = null;

	setStatusMessage(message: string | null) {
		if (this.#statusMessageTimer) {
			clearTimeout(this.#statusMessageTimer);
			this.#statusMessageTimer = null;
		}
		this.statusMessage = message;
		if (!message) return;
		this.#statusMessageTimer = setTimeout(() => {
			this.statusMessage = null;
			this.#statusMessageTimer = null;
		}, STATUS_MESSAGE_MS);
	}

	toggleViewportShowNodes() {
		this.viewportShowNodes = !this.viewportShowNodes;
	}

	toggleViewportShowPaths() {
		this.viewportShowPaths = !this.viewportShowPaths;
	}

	toggleViewportShowFraming() {
		this.viewportShowFraming = !this.viewportShowFraming;
	}
}
