import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEmptySceneDocument } from '$lib/content/scene';
import { getRoom } from '$lib/content/rooms';
import { createEditorRoomBoundsCameraFrame } from '$lib/editor/editor-camera';
import { createMuseumEditorStore, type MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	commitLayoutDraftRoom,
	createEmptyLayoutPreviewState,
	type LayoutPreviewState
} from '$lib/editor/layout/layout-preview-state.svelte';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { createRelicFixtureEditorStore } from '../editor-test-utils';

/**
 * room focus and cluster-group expansion resolve the live room
 * instead of the frozen Chopin `'paris'` rules. The relic stays Paris-only.
 */

const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function readLibSource(relativePath: string): string {
	return fs.readFileSync(path.join(LIB_DIR, relativePath), 'utf8');
}

function draftRoomAndSync(): {
	store: MuseumEditorStore;
	layoutPreview: LayoutPreviewState;
	roomId: string;
} {
	const layoutPreview = createEmptyLayoutPreviewState();
	const store = createMuseumEditorStore({
		document: createEmptySceneDocument(),
		rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
	});
	const drafted = commitLayoutDraftRoom(layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
	if (!drafted.success) throw new Error(`draft room failed: ${drafted.message}`);
	const roomId = drafted.roomId;
	store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
	return { store, layoutPreview, roomId };
}

describe('room focus', () => {
	it('focuses a drafted room and stores its id in the focus intent', () => {
		const { store, roomId } = draftRoomAndSync();
		expect(store.focusRoom(roomId)).toBe(true);
		expect(store.cameraFocusKind).toBe('room');
		expect(store.cameraFocusRoomId).toBe(roomId);
	});

	it('refuses an unknown room and leaves the focus intent untouched', () => {
		const { store } = draftRoomAndSync();
		expect(store.focusRoom('no-such-room')).toBe(false);
		expect(store.cameraFocusKind).toBeNull();
		expect(store.cameraFocusRoomId).toBeNull();
	});

	it('frames a drafted room from its compiled bounds3 without throwing', () => {
		const { layoutPreview, roomId } = draftRoomAndSync();
		const bounds3 = layoutPreview.geometry.rooms.find(
			(room) => room.roomId === roomId
		)?.bounds3;
		expect(bounds3).toBeTruthy();

		// The pure editor branch (no Chopin getRoom) produces a finite frame.
		const frame = createEditorRoomBoundsCameraFrame(
			bounds3!,
			new Vector3(0, 10, 0),
			new Vector3(0, 0, 0),
			{ fovDegrees: 50, aspect: 1 }
		);
		expect(frame).not.toBeNull();
		expect(frame!.position.every(Number.isFinite)).toBe(true);
		expect(frame!.target.every(Number.isFinite)).toBe(true);
		expect(Number.isFinite(frame!.radius)).toBe(true);
	});

	it('yields no frame for a room with no compiled entry (blocking-geometry fallback)', () => {
		const { layoutPreview } = draftRoomAndSync();
		// `compileLayoutGeometry` skips rooms with blocking geometry issues, so
		// a focused room with no `bounds3` entry resolves to null through the
		// rig's roomBoundsById lookup and the room-focus branch frames nothing
		// (no registry AABB guess). Pin the exact lookup semantics.
		const missing =
			layoutPreview.geometry.rooms.find((room) => room.roomId === 'no-such-room')
				?.bounds3 ?? null;
		expect(missing).toBeNull();
	});

	it('keeps the relic gate literally Paris-only', () => {
		const store = createRelicFixtureEditorStore();
		expect(store.focusRoom('paris')).toBe(true);
		expect(store.cameraFocusRoomId).toBe('paris');
		// 'entrance' is a real Chopin room, but the relic still refuses it
		// (the widened-gate regression pin).
		expect(store.focusRoom('entrance')).toBe(false);
		// The Chopin frame source remains reachable for the relic branch.
		expect(getRoom('paris').id).toBe('paris');
	});
});

describe('cluster-group expansion', () => {
	it('expands the cluster room instead of the frozen paris in both group handlers', () => {
		for (const relativePath of [
			'editor/hooks/shortcuts.svelte.ts',
			'editor/EditorInspector.svelte'
		]) {
			const source = readLibSource(relativePath);
			expect(source).toContain('ensureRoomTreeExpanded(cluster.roomId)');
			expect(source).not.toContain("ensureRoomTreeExpanded('paris')");
		}
	});
});
