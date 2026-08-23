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
 * connection the camera-workspace is scrubbing.
 *
 * **Cross-cutting invariants** — encoded once in the reducer:
 *
 *   1. `setWorkspace(s)` with a real pick (`cluster`, or `placement` with
 *      `ids.length > 0`) clears navigation + discovery. Room-only empty
 *      placement does **not** clear nav (asset-placement latent mode).
 *   2. `setNavigation(s ∈ nav-non-none)` clears placement/cluster pick but
 *      **keeps room** as empty placement (pre-slice `selectedRoomId` survived).
 *   3. `setNavigation(s = { kind: 'none' | 'node' })` clears discovery.
 *   4. `setNavigation(connection|view-keyframe)` mirrors direction into discovery;
 *      `anchor` keeps discovery direction unless the connection changes
 *      (caller may `setDiscovery` afterward for switch-to-forward).
 *   5. `setDiscovery(non-null)` clears a real workspace pick, keeping room.
 */

import type {
	NavigationSelection,
	WorkspaceSelection
} from '../editor-types';
import type { EditorSessionState } from './session-state.svelte';
import type { CameraConnectionDirection, RoomId } from '$lib/types/scene';
import type { EditorNavigationSelection } from '../editor-selection';

/**
 * Read adapter (moved from the facade, P7.1) — translate the parallel-tuple
 * `NavigationSelection` into the legacy `EditorNavigationSelection` shape that
 * the editor's 3D picker and tree use. Direction stays owned by the discovery
 * slots (H1 s4): `connection` reads omit direction. Module scope to avoid
 * re-creating the closure per call.
 */
export function navigationSelectionFromState(
	state: NavigationSelection
): EditorNavigationSelection {
	switch (state.kind) {
		case 'none':
			return null;
		case 'node':
			return { kind: 'node', nodeId: state.nodeId, handle: state.handle };
		case 'connection':
			// Legacy public surface omits direction — discovery owns it.
			return { kind: 'connection', connectionId: state.connectionId };
		case 'anchor':
			return {
				kind: 'anchor',
				connectionId: state.connectionId,
				anchorId: state.anchorId
			};
		case 'view-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: state.connectionId,
				direction: state.direction,
				keyframeId: state.keyframeId
			};
	}
}

function roomOnly(roomId: RoomId): WorkspaceSelection {
	return { kind: 'placement', ids: [], clusterId: null, roomId };
}

function workspaceRoomId(workspace: WorkspaceSelection): RoomId | null {
	return workspace.kind === 'none' ? null : workspace.roomId;
}

function hasRealWorkspacePick(workspace: WorkspaceSelection): boolean {
	return (
		workspace.kind === 'cluster' ||
		(workspace.kind === 'placement' && workspace.ids.length > 0)
	);
}

export class EditorSelectionStore {
	#session: EditorSessionState | null = null;

	/**
	 * fired by the reducer when a *real actionable* pick lands
	 * (cluster, placement ids > 0, or non-none navigation). The editor shell
	 * clears the layout selection here; the no-op default keeps the frozen
	 * relic untouched. Room-only placement and deselect never fire it.
	 */
	#onSelectionActivate: (() => void) | null = null;

	/**
	 * the only injection seam for the cross-domain hook: the store is
	 * a private field initializer inside `EditorStore`, so the shell
	 * passes the callback through `createEditorStore` options and this
	 * setter, not a constructor arg.
	 */
	setOnSelectionActivate(callback: (() => void) | null): void {
		this.#onSelectionActivate = callback;
	}

	workspace = $state<WorkspaceSelection>({ kind: 'none' });

	navigation = $state<NavigationSelection>({ kind: 'none' });

	discoveryConnectionId = $state<string | null>(null);

	discoveryDirection = $state<CameraConnectionDirection>('forward');

	bindSession(session: EditorSessionState) {
		this.#session = session;
	}

	expandRoom(roomId: RoomId): boolean {
		return this.#requireSession().expandRoom(roomId);
	}

	expandCluster(clusterId: string): boolean {
		return this.#requireSession().expandCluster(clusterId);
	}

	expandCameraConnection(connectionId: string): boolean {
		return this.#requireSession().expandCameraConnection(connectionId);
	}

	expandCameraDirection(
		connectionId: string,
		direction: CameraConnectionDirection
	): boolean {
		return this.#requireSession().expandCameraDirection(connectionId, direction);
	}

	setWorkspace(s: WorkspaceSelection) {
		this.workspace = s;
		if (hasRealWorkspacePick(s) && this.navigation.kind !== 'none') {
			this.navigation = { kind: 'none' };
			this.discoveryConnectionId = null;
			this.discoveryDirection = 'forward';
		}
		// a real pick activates the scene domain and detaches the
		// previous domain (layout). Fires after the internal cross-clearing so
		// layout is the last thing cleared (detach-then-attach ordering).
		if (hasRealWorkspacePick(s)) this.#onSelectionActivate?.();
	}

	setNavigation(s: NavigationSelection) {
		this.navigation = s;
		if (s.kind === 'none' || s.kind === 'node') {
			this.discoveryConnectionId = null;
			this.discoveryDirection = 'forward';
		} else if (s.kind === 'connection') {
			this.discoveryConnectionId = s.connectionId;
			this.discoveryDirection = s.direction;
		} else if (s.kind === 'view-keyframe') {
			this.discoveryConnectionId = s.connectionId;
			this.discoveryDirection = s.direction;
		} else {
			// anchor — adopt connectionId; keep direction (caller may override)
			this.discoveryConnectionId = s.connectionId;
		}
		if (s.kind !== 'none' && hasRealWorkspacePick(this.workspace)) {
			const roomId = workspaceRoomId(this.workspace);
			this.workspace = roomId ? roomOnly(roomId) : { kind: 'none' };
		}
		// a non-none navigation activates the camera domain and
		// detaches the previous domain (layout).
		if (s.kind !== 'none') this.#onSelectionActivate?.();
	}

	setDiscovery(
		connectionId: string | null,
		direction: CameraConnectionDirection = 'forward'
	) {
		this.discoveryConnectionId = connectionId;
		this.discoveryDirection = direction;
		if (connectionId !== null && hasRealWorkspacePick(this.workspace)) {
			const roomId = workspaceRoomId(this.workspace);
			this.workspace = roomId ? roomOnly(roomId) : { kind: 'none' };
		}
	}

	#requireSession(): EditorSessionState {
		if (!this.#session) {
			throw new Error('EditorSelectionStore requires a bound EditorSessionState');
		}
		return this.#session;
	}
}
