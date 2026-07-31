/**
 * `EditorSelectionStore` — the parallel-tuple selection reducer (Slice 4).
 *
 * Audit §3.D corrected the original god-union draft and split editor
 * selection into **two** parallel state slots:
 *
 * - `workspace` — placement or cluster pick (3 kinds).
 * - `navigation` — node / connection / anchor / view-keyframe pick (5 kinds).
 *
 * A third slot `discoveryConnectionId` + `discoveryDirection` carries the
 * "Phase 2.1 persistent camera-key discovery" — the currently-exposed
 * connection the camera-workspace is scrubbing. The plan §3.D invariant
 * 
 *   > leaving navigation cancels the persistent camera discovery
 *
 * collapses to **one** line inside `setNavigation` below: when
 * `navigation.kind ∈ {'node', 'none'}` the discovery slots clear; when
 * `navigation.kind ∈ {'connection', 'anchor', 'view-keyframe'}` discovery
 * mirrors the `connectionId` (and `direction` for view-keyframe).
 *
 * **Cross-cutting invariants** — encoded once in the reducer:
 *
 *   1. `setWorkspace(s ∈ workspace-non-none)` clears any open navigation.
 *   2. `setNavigation(s ∈ nav-non-none)` clears any open workspace.
 *   3. `setNavigation(s = { kind: 'none' })` clears persisted discovery.
 *   4. `setNavigation(s = { kind: 'node' })` clears persisted discovery.
 *   5. `setDiscovery(non-null)` clears a non-empty workspace.
 *
 * The pre-slice god file's `selectX` methods all carry the same five-line
 * reset dance — these five invariants fold the dance into a one-rune write
 * per site.
 *
 * **No `$state.raw`** — slots are read continuously by templates and
 * getters; reactivity wins over raw throughput here.
 *
 * **No document reads.** This sub-store deliberately does not import the
 * document store. It owns selection shape + cross-clear; the composition
 * root enforces mutation blocks / pending commands before calling setX.
 */

import type {
	NavigationSelection,
	WorkspaceSelection
} from '../museum-editor.types';
import type { CameraConnectionDirection } from '$lib/types/museum';

export class EditorSelectionStore {
	// ============================================================
	// Two parallel selection state slots.
	// ============================================================

	workspace = $state<WorkspaceSelection>({ kind: 'none' });

	navigation = $state<NavigationSelection>({ kind: 'none' });

	// ============================================================
	// Persistent camera-key discovery (Phase 2.1).
	//
	// Mirrors the connection+direction inside `this.navigation` whenever
	// nav.kind ∈ {connection, anchor, view-keyframe}. Cleared when the
	// user leaves nav or switches to a node selection.
	// ============================================================

	discoveryConnectionId = $state<string | null>(null);

	discoveryDirection = $state<CameraConnectionDirection>('forward');

	// ============================================================
	// Reducer entry points.
	// ============================================================

	/**
	 * Set the workspace selection. Cross-clear: entering a non-`'none'`
	 * workspace selection closes any open navigation pane so the two
	 * parallel slots remain mutually exclusive.
	 *
	 * Leaving workspace (going to `{ kind: 'none' }`) does NOT clear
	 * discovery — the camera-connection-focused mode is a separate
	 * persistent UI state the camera workspace reads even when no
	 * placement or cluster is selected.
	 */
	setWorkspace(s: WorkspaceSelection) {
		this.workspace = s;
		if (s.kind !== 'none' && this.navigation.kind !== 'none') {
			this.navigation = { kind: 'none' };
		}
	}

	/**
	 * Set the navigation selection. Two cross-clear rules fire here:
	 *
	 * - entering any non-`'none'` navigation clears the workspace
	 *   (`setWorkspace({kind:'none'})` is implicit).
	 * - entering `'none'` or `'node'` clears the persisted camera-key
	 *   discovery slot; entering `'connection' | 'anchor' | 'view-keyframe'`
	 *   mirrors the connection (and `direction` for view-keyframe) into it.
	 *
	 * The five-line "Phase 2.1: leaving a connection focus cancels the
	 * persistent camera discovery" pattern that used to repeat in 5+
	 * pre-slice selectX methods collapses to this one reducer.
	 */
	setNavigation(s: NavigationSelection) {
		this.navigation = s;
		if (s.kind === 'none' || s.kind === 'node') {
			this.discoveryConnectionId = null;
			this.discoveryDirection = 'forward';
		} else {
			// connection / anchor / view-keyframe → discovery = (connectionId[, direction]).
			this.discoveryConnectionId = s.connectionId;
			this.discoveryDirection =
				s.kind === 'view-keyframe' ? s.direction : 'forward';
		}
		if (s.kind !== 'none' && this.workspace.kind !== 'none') {
			this.workspace = { kind: 'none' };
		}
	}

	/**
	 * Set the persisted discovery directly without changing nav. Used by
	 * `selectCameraConnectionDirection` and the tree helpers that flip
	 * the camera-workspace's currently-scrubbing connection without
	 * opening an anchor or view-keyframe editor.
	 *
	 * Cross-clear: setting a non-`null` discovery closes any open workspace
	 * selection so the camera workspace is exclusive to it.
	 */
	setDiscovery(
		connectionId: string | null,
		direction: CameraConnectionDirection = 'forward'
	) {
		this.discoveryConnectionId = connectionId;
		this.discoveryDirection = direction;
		if (connectionId !== null && this.workspace.kind !== 'none') {
			this.workspace = { kind: 'none' };
		}
	}
}
